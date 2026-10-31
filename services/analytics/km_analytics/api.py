"""HTTP boundary of the analytics service.

The service is stateless compute plus read-only access to public reference
data (the routing network). It never receives Supabase user credentials:
the web tier authenticates users, enforces ownership, and calls this service
with a shared bearer token (``ANALYTICS_SERVICE_TOKEN``) over TLS.
"""

from __future__ import annotations

import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from pydantic import BaseModel, Field

from .analyze import explain
from .geo import segment_m
from .routing import network
from .routing.engine import Hazard, RouteRequest, generate
from .routing.validate import route_waypoints, validate
from .model import ActivityFileError
from .pipeline import analyze_file

MAX_UPLOAD_BYTES = 25 * 1024 * 1024

app = FastAPI(title="KindaMoving analytics", version="1", docs_url=None, redoc_url=None)


def require_service_token(authorization: str = Header(default="")) -> None:
    expected = os.environ.get("ANALYTICS_SERVICE_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(503, "Service token is not configured.")
    if not hmac.compare_digest(authorization.encode(), f"Bearer {expected}".encode()):
        raise HTTPException(401, "Invalid service token.")


@app.exception_handler(ActivityFileError)
async def file_error(_: Request, exc: ActivityFileError) -> JSONResponse:
    return JSONResponse({"error": str(exc), "code": "invalid_file"}, status_code=422)


@app.get("/healthz")
def health() -> dict:
    return {"ok": True}


async def _body(request: Request, limit: int = MAX_UPLOAD_BYTES) -> bytes:
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise HTTPException(413, "Payload too large.")
        chunks.append(chunk)
    return b"".join(chunks)


@app.post("/v1/activities/parse", dependencies=[Depends(require_service_token)])
async def parse_activity(request: Request, format: str, tz: str | None = None) -> dict:
    """Raw file bytes in the body; ``format`` is gpx|fit; ``tz`` is an IANA fallback zone."""
    if format not in ("gpx", "fit"):
        raise HTTPException(400, "format must be gpx or fit")
    data = await _body(request)
    if not data:
        raise HTTPException(400, "Empty file.")
    return await run_in_threadpool(analyze_file, data, format, tz)


@app.post("/v1/analyze/explain", dependencies=[Depends(require_service_token)])
async def explain_run(request: Request) -> dict:
    """{target, candidates[], history[]} summaries (no streams) -> evidence-backed observations."""
    body = await request.json()
    if not isinstance(body, dict) or not isinstance(body.get("target"), dict):
        raise HTTPException(400, "target is required")
    candidates = body.get("candidates") or []
    history = body.get("history") or []
    if not isinstance(candidates, list) or not isinstance(history, list) or len(candidates) > 500 or len(history) > 2000:
        raise HTTPException(400, "candidates/history must be bounded lists")
    return await run_in_threadpool(explain, body["target"], candidates, history)


class HazardIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radius_m: float = Field(gt=0, le=500)
    weight: float = Field(ge=0, le=1)
    kind: str = Field(max_length=40)
    label: str = Field(default="", max_length=120)


class RouteIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    distance_m: float = Field(ge=1000, le=42195)
    tolerance: float = Field(default=0.1, ge=0.02, le=0.3)
    shape: str = Field(default="loop", pattern="^(loop|out_and_back)$")
    tempo_m: float | None = Field(default=None, ge=400, le=21097)
    tempo_max_major: int = Field(default=0, ge=0, le=5)
    tempo_max_minor: int = Field(default=2, ge=0, le=20)
    elevation: str = Field(default="any", pattern="^(any|flat|hilly)$")
    surface: str = Field(default="any", pattern="^(any|paved|unpaved)$")
    prefer_lit: bool = False
    hazards: list[HazardIn] = Field(default_factory=list, max_length=300)
    max_results: int = Field(default=5, ge=1, le=8)


class Point(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class SnapIn(BaseModel):
    waypoints: list[Point] = Field(min_length=2, max_length=60)
    surface: str = Field(default="any", pattern="^(any|paved|unpaved)$")
    hazards: list[HazardIn] = Field(default_factory=list, max_length=300)


class ValidateIn(BaseModel):
    coordinates: list[list[float]] = Field(min_length=2, max_length=20000)


def _graph(lat: float, lon: float, radius: float):
    if not network.database_url():
        raise HTTPException(503, "Routing network is not configured.")
    try:
        return network.load(lat, lon, radius)
    except Exception as exc:  # database outage is a retryable service error
        raise HTTPException(503, "Routing network unavailable.") from exc


@app.post("/v1/routes/generate", dependencies=[Depends(require_service_token)])
async def generate_routes(body: RouteIn) -> dict:
    if body.tempo_m and body.tempo_m >= body.distance_m:
        raise HTTPException(400, "The tempo section must be shorter than the run.")
    g = await run_in_threadpool(_graph, body.lat, body.lon, body.distance_m / 2 + 1500)
    req = RouteRequest(**{**body.model_dump(), "hazards": [Hazard(**h.model_dump()) for h in body.hazards]})
    return await run_in_threadpool(generate, g, req)


@app.post("/v1/routes/snap", dependencies=[Depends(require_service_token)])
async def snap_route(body: SnapIn) -> dict:
    lats = [w.lat for w in body.waypoints]
    lons = [w.lon for w in body.waypoints]
    radius = max(segment_m(min(lats), min(lons), max(lats), max(lons)), 1000) / 2 + 1000
    g = await run_in_threadpool(_graph, sum(lats) / len(lats), sum(lons) / len(lons), radius)
    req = RouteRequest(lat=lats[0], lon=lons[0], distance_m=1000, surface=body.surface, hazards=[Hazard(**h.model_dump()) for h in body.hazards])
    return await run_in_threadpool(route_waypoints, g, [w.model_dump() for w in body.waypoints], req)


@app.post("/v1/routes/validate", dependencies=[Depends(require_service_token)])
async def validate_route(body: ValidateIn) -> dict:
    coords = body.coordinates
    if any(len(c) < 2 or not (-180 <= c[0] <= 180 and -90 <= c[1] <= 90) for c in coords):
        raise HTTPException(400, "Coordinates must be [lon, lat].")
    lats = [c[1] for c in coords]
    lons = [c[0] for c in coords]
    radius = segment_m(min(lats), min(lons), max(lats), max(lons)) / 2 + 500
    g = await run_in_threadpool(_graph, sum(lats) / len(lats), sum(lons) / len(lons), radius)
    return await run_in_threadpool(validate, g, coords)

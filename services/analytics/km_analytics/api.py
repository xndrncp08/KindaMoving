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

from .analyze import explain
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

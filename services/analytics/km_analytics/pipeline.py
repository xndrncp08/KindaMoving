"""File bytes -> normalized activity payload persisted by the web tier's import RPC."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import metrics
from .clean import Track, process
from .fit import parse_fit
from .geo import LocalProjection, simplify
from .gpx import parse_gpx
from .model import ActivityFileError, ParsedActivity

MAX_STREAM_POINTS = 20000
TRACK_TOLERANCE_M = 2.0
VERSION = "km-analytics/1"


def parse_bytes(data: bytes, fmt: str) -> ParsedActivity:
    if fmt == "fit":
        return parse_fit(data)
    if fmt == "gpx":
        return parse_gpx(data)
    raise ActivityFileError("Only GPX and FIT files are supported.")


def streams(track: Track) -> dict:
    """Columnar streams, offsets in seconds from start; thinned to MAX_STREAM_POINTS by even stride."""
    step = max(1, -(-len(track.t) // MAX_STREAM_POINTS))
    idx = list(range(0, len(track.t), step))
    if idx[-1] != len(track.t) - 1:
        idx.append(len(track.t) - 1)
    r = lambda v, n: None if v is None else round(v, n)  # noqa: E731
    return {
        "t": [round(track.t[i] - track.t[0], 1) for i in idx],
        "dist": [round(track.dist[i], 1) for i in idx],
        "lat": [r(track.lat[i], 6) for i in idx],
        "lon": [r(track.lon[i], 6) for i in idx],
        "ele": [r(track.ele[i], 1) for i in idx],
        "hr": [r(track.hr[i], 0) for i in idx],
        "cad": [r(track.cad[i], 0) for i in idx],
        "moving": [track.moving[i] for i in idx],
    }


def track_geometry(track: Track) -> dict | None:
    pts = [(lat, lon) for lat, lon in zip(track.lat, track.lon) if lat is not None]
    if len(pts) < 2:
        return None
    proj = LocalProjection(*pts[0])
    keep = simplify([proj.to_xy(*p) for p in pts], TRACK_TOLERANCE_M)
    return {"type": "LineString", "coordinates": [[round(pts[i][1], 6), round(pts[i][0], 6)] for i in keep]}


def analyze_file(data: bytes, fmt: str, fallback_tz: str | None = None) -> dict:
    parsed = parse_bytes(data, fmt)
    track = process(parsed, fallback_tz)
    summary = metrics.summarize(track, parsed.laps)
    start = datetime.fromtimestamp(track.t[0], tz=timezone.utc)
    local_start = start + timedelta(seconds=track.utc_offset_s)
    local_end = local_start + timedelta(seconds=track.t[-1] - track.t[0])
    return {
        "version": VERSION,
        "format": fmt,
        "name": parsed.name,
        "sport": track.sport,
        "start_time": start.isoformat(),
        "local_date": local_start.date().isoformat(),
        "utc_offset_s": track.utc_offset_s,
        "timezone_assumed": track.timezone_assumed,
        "crosses_midnight": local_end.date() != local_start.date(),
        "device": parsed.device,
        "distance_source": track.distance_source,
        "summary": summary,
        "stoppages": track.stoppages,
        "streams": streams(track),
        "track": track_geometry(track),
        "quality": track.quality,
        "warnings": track.warnings,
    }

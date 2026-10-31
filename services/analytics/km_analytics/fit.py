"""FIT activity parser built on Garmin's official FIT SDK (garmin-fit-sdk).

Integrity policy: the SDK's CRC check is enforced. A truncated or corrupted
file is rejected rather than partially imported, because a partial import would
silently produce wrong distance/time totals.
"""

from __future__ import annotations

import math
from datetime import datetime

from garmin_fit_sdk import FIT_EPOCH_S, Decoder, Stream

from .gpx import normalize_sport
from .model import ActivityFileError, Lap, ParsedActivity, Sample

SEMICIRCLE = 180 / 2**31


def _ts(value) -> float | None:
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, (int, float)):
        return float(value) + FIT_EPOCH_S
    return None


def _num(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None


def parse_fit(data: bytes) -> ParsedActivity:
    stream = Stream.from_byte_array(bytearray(data))
    decoder = Decoder(stream)
    if not decoder.is_fit():
        raise ActivityFileError("Not a FIT file (missing .FIT header signature).")
    if not decoder.check_integrity():
        raise ActivityFileError("FIT integrity check failed (CRC mismatch). The file may be truncated or corrupted.")
    try:
        # check_integrity() consumes the stream; decode from a fresh one.
        messages, errors = Decoder(Stream.from_byte_array(bytearray(data))).read(convert_types_to_strings=True, merge_heart_rates=True)
    except Exception as exc:  # the SDK raises bare exceptions on malformed definitions
        raise ActivityFileError("FIT file could not be decoded.") from exc
    if errors:
        raise ActivityFileError("FIT file could not be decoded: " + str(errors[0])[:200])
    file_ids = messages.get("file_id_mesgs", [])
    if file_ids and file_ids[0].get("type") not in (None, "activity"):
        raise ActivityFileError(f"FIT file type '{file_ids[0].get('type')}' is not an activity (courses are routes, not runs).")

    activity = ParsedActivity(format="fit", elevation_source="device")
    if file_ids:
        f = file_ids[0]
        activity.device = {
            k: f[k] for k in ("manufacturer", "product", "garmin_product", "serial_number") if f.get(k) is not None and not isinstance(f.get(k), bytes)
        }
        activity.device = {k: (v if isinstance(v, (int, str)) else str(v)) for k, v in activity.device.items()}
    sessions = messages.get("session_mesgs", [])
    if sessions:
        sport = sessions[0].get("sport")
        sub = sessions[0].get("sub_sport")
        if isinstance(sport, str):
            activity.sport = normalize_sport("trail_running" if sub == "trail" else sport)
    for msg in messages.get("activity_mesgs", []):
        ts, local = _ts(msg.get("timestamp")), msg.get("local_timestamp")
        if ts is not None and isinstance(local, (int, float)):
            offset = round((local + FIT_EPOCH_S - ts) / 900) * 900  # offsets are multiples of 15 min
            if abs(offset) <= 14 * 3600:
                activity.utc_offset_s = int(offset)

    for r in messages.get("record_mesgs", []):
        t = _ts(r.get("timestamp"))
        if t is None:
            continue
        lat, lon = r.get("position_lat"), r.get("position_long")
        cad = _num(r.get("cadence"))
        if cad is not None and _num(r.get("fractional_cadence")) is not None:
            cad += r["fractional_cadence"]
        activity.samples.append(
            Sample(
                t=t,
                lat=lat * SEMICIRCLE if isinstance(lat, int) else None,
                lon=lon * SEMICIRCLE if isinstance(lon, int) else None,
                ele=_num(r.get("enhanced_altitude", r.get("altitude"))),
                hr=_num(r.get("heart_rate")),
                # FIT running cadence is strides/min (one foot); store steps/min.
                cad=cad * 2 if cad is not None and activity.sport in ("running", "trail_running", "walking", "hiking") else cad,
                device_dist=_num(r.get("distance")),
            )
        )
    for lap in messages.get("lap_mesgs", []):
        start, end = _ts(lap.get("start_time")), _ts(lap.get("timestamp"))
        if start is not None and end is not None and end > start:
            activity.laps.append(Lap(start=start, end=end, distance_m=_num(lap.get("total_distance"))))
    if not activity.samples:
        raise ActivityFileError("FIT file has no record samples.")
    return activity

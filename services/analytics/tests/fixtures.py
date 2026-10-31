"""Deterministic synthetic activities. Every fixture is generated from a seed, never recorded data."""

from __future__ import annotations

import math
import random
from datetime import datetime, timezone

from garmin_fit_sdk import Encoder, Profile

from km_analytics.geo import LocalProjection, destination
from km_analytics.model import ParsedActivity, Sample

ORIGIN = (51.0447, -114.0719)  # downtown Calgary
T0 = datetime(2026, 10, 1, 13, 0, tzinfo=timezone.utc).timestamp()
MESG = Profile["mesg_num"]


def straight_run(
    seconds: int = 1800,
    speed: float = 3.0,
    bearing: float = 90.0,
    noise_m: float = 0.0,
    seed: int = 1,
    hr: float | None = 150.0,
    ele: float | None = 1045.0,
    start: float = T0,
    interval: float = 1.0,
) -> list[Sample]:
    rng = random.Random(seed)
    out = []
    steps = int(seconds / interval)
    # Ellipsoidal local projection (not the spherical ``destination``) so the
    # generated geometry has exactly the intended length on WGS84.
    proj = LocalProjection(*ORIGIN)
    sin_b, cos_b = math.sin(math.radians(bearing)), math.cos(math.radians(bearing))
    for k in range(steps + 1):
        d = speed * k * interval
        lat, lon = proj.to_latlon(d * sin_b, d * cos_b)
        if noise_m:
            lat, lon = destination(lat, lon, rng.uniform(0, 360), rng.uniform(0, noise_m))
        out.append(Sample(t=start + k * interval, lat=lat, lon=lon, ele=ele, hr=hr, cad=170.0))
    return out


def parsed(samples: list[Sample], sport: str = "running", fmt: str = "gpx") -> ParsedActivity:
    return ParsedActivity(format=fmt, sport=sport, samples=samples)


def to_gpx(samples: list[Sample], name: str = "Fixture run", extra_header: str = "") -> bytes:
    pts = []
    for s in samples:
        stamp = datetime.fromtimestamp(s.t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ext = f"<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>{int(s.hr)}</gpxtpx:hr><gpxtpx:cad>{int(s.cad / 2)}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions>" if s.hr else ""
        ele = f"<ele>{s.ele}</ele>" if s.ele is not None else ""
        pts.append(f'<trkpt lat="{s.lat:.7f}" lon="{s.lon:.7f}">{ele}<time>{stamp}</time>{ext}</trkpt>')
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>{extra_header}'
        '<gpx version="1.1" creator="fixture" xmlns="http://www.topografix.com/GPX/1/1" '
        'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">'
        f"<trk><name>{name}</name><type>running</type><trkseg>{''.join(pts)}</trkseg></trk></gpx>"
    ).encode()


def to_fit(samples: list[Sample], local_offset_s: int = -6 * 3600, laps: list[tuple[float, float, float]] = (), file_type: str = "activity") -> bytes:
    def dt(t: float) -> datetime:
        return datetime.fromtimestamp(t, tz=timezone.utc)

    e = Encoder()
    e.on_mesg(MESG["FILE_ID"], {"type": file_type, "manufacturer": "coros", "product": 1, "serial_number": 4242, "time_created": dt(samples[0].t)})
    dist = 0.0
    from km_analytics.geo import segment_m

    prev = None
    for s in samples:
        if prev is not None and s.lat is not None and prev.lat is not None:
            dist += segment_m(prev.lat, prev.lon, s.lat, s.lon)
        prev = s
        rec = {"timestamp": dt(s.t), "distance": dist}
        if s.lat is not None:
            rec["position_lat"] = int(round(s.lat / 180 * 2**31))
            rec["position_long"] = int(round(s.lon / 180 * 2**31))
        if s.ele is not None:
            rec["enhanced_altitude"] = s.ele
        if s.hr is not None:
            rec["heart_rate"] = int(s.hr)
        if s.cad is not None:
            rec["cadence"] = int(s.cad / 2)
        e.on_mesg(MESG["RECORD"], rec)
    for start, end, d in laps:
        e.on_mesg(MESG["LAP"], {"timestamp": dt(end), "start_time": dt(start), "total_elapsed_time": end - start, "total_distance": d})
    end = samples[-1].t
    e.on_mesg(MESG["SESSION"], {"timestamp": dt(end), "start_time": dt(samples[0].t), "sport": "running", "total_elapsed_time": end - samples[0].t, "total_distance": dist})
    e.on_mesg(MESG["ACTIVITY"], {"timestamp": dt(end), "local_timestamp": int(end - 631065600 + local_offset_s), "num_sessions": 1})
    return e.close()


def continue_from(prev: list[Sample], seg: list[Sample]) -> list[Sample]:
    """Translate ``seg`` so it starts where ``prev`` ended (shift computed once, before mutation)."""
    d_lat, d_lon = prev[-1].lat - seg[0].lat, prev[-1].lon - seg[0].lon
    for smp in seg:
        smp.lat += d_lat
        smp.lon += d_lon
    return seg

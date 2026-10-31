"""GPX 1.0/1.1 track parser.

Security: parsed with defusedxml, so DTDs, entity expansion and external
references are rejected. Elements are matched by local name because exporters
disagree on namespaces (GPX 1.0 vs 1.1, Garmin TrackPointExtension v1/v2, etc.).
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

import defusedxml.ElementTree as ET
from defusedxml import DefusedXmlException

from .model import ActivityFileError, ParsedActivity, Sample

HR_TAGS = {"hr", "heartrate"}
CAD_TAGS = {"cad", "cadence", "runcadence"}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _num(text: str | None) -> float | None:
    try:
        value = float(text) if text is not None else None
    except ValueError:
        return None
    return value if value is not None and math.isfinite(value) else None


def parse_time(text: str) -> tuple[float, bool]:
    """Return (unix seconds, had_explicit_zone). GPX mandates UTC; naive values are assumed UTC."""
    value = datetime.fromisoformat(text.strip().replace("z", "Z"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).timestamp(), False
    return value.timestamp(), True


def parse_gpx(data: bytes) -> ParsedActivity:
    try:
        root = ET.fromstring(data, forbid_dtd=True)
    except (ET.ParseError, DefusedXmlException) as exc:
        raise ActivityFileError("GPX file is not well-formed XML or uses forbidden DTD/entities.") from exc
    if _local(root.tag) != "gpx":
        raise ActivityFileError("Root element is not <gpx>.")
    activity = ParsedActivity(format="gpx")
    naive_times = bad_times = 0
    for trk in (el for el in root if _local(el.tag) == "trk"):
        for child in trk:
            name = _local(child.tag)
            if name == "name" and child.text and not activity.name:
                activity.name = child.text.strip()[:120]
            elif name == "type" and child.text:
                activity.sport = normalize_sport(child.text)
        for pt in trk.iter():
            if _local(pt.tag) != "trkpt":
                continue
            lat, lon = _num(pt.get("lat")), _num(pt.get("lon"))
            sample = Sample(t=math.nan, lat=lat, lon=lon)
            for el in pt.iter():
                tag = _local(el.tag)
                if tag == "time" and el.text:
                    try:
                        sample.t, explicit = parse_time(el.text)
                        naive_times += not explicit
                    except ValueError:
                        bad_times += 1
                elif tag == "ele":
                    sample.ele = _num(el.text)
                elif tag in HR_TAGS:
                    sample.hr = _num(el.text)
                elif tag in CAD_TAGS:
                    sample.cad = _num(el.text)
            activity.samples.append(sample)
    if not activity.samples:
        raise ActivityFileError("GPX contains no track points. Routes and waypoints are not activities.")
    if naive_times:
        activity.warnings.append(f"{naive_times} timestamps had no time zone and were treated as UTC.")
    if bad_times:
        activity.warnings.append(f"{bad_times} unreadable timestamps were ignored.")
    # Garmin/COROS GPX cadence is per-foot (strides/min); convert to steps/min when clearly per-foot.
    cads = [s.cad for s in activity.samples if s.cad]
    if cads and sorted(cads)[len(cads) // 2] < 120:
        for s in activity.samples:
            if s.cad is not None:
                s.cad *= 2
    return activity


def normalize_sport(value: str) -> str:
    v = value.strip().lower().replace("-", "_").replace(" ", "_")
    if v in {"9", "1"} or "trail" in v:
        return "trail_running" if "trail" in v else "running"
    if "run" in v:
        return "running"
    if "walk" in v or "hik" in v:
        return "walking" if "walk" in v else "hiking"
    if "cycl" in v or "bik" in v or "ride" in v:
        return "cycling"
    return v[:40] or "running"

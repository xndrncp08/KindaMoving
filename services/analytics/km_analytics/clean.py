"""Sample cleaning: from raw parsed samples to a trustworthy, analyzable track.

Pipeline, in order (each stage's counts are reported in ``Track.quality``):

1. Drop samples without a usable timestamp.
2. Clock repair. A backwards timestamp jump where the *file order* is spatially
   continuous (< 50 m step) is treated as a device clock correction: later
   timestamps are shifted so the gap equals the median sampling interval. Any
   remaining disorder (e.g. merged/concatenated GPX segments) is resolved by a
   stable sort. Duplicate timestamps are merged, first value wins.
3. Coordinate validation: out-of-range values and the (0, 0) "null island"
   placeholder are discarded (the sample keeps its HR/cadence).
4. GPS outlier rejection, forward pass: a fix implying a speed above the
   sport's plausible maximum from the last accepted fix is rejected, unless the
   next ``CONFIRM`` fixes agree with it (a genuine re-acquisition after signal
   loss, e.g. under a bridge), in which case it is accepted.
5. Distance. Jitter while standing still inflates naive GPS distance, so a
   segment only contributes when the *windowed* speed (distance between the
   centroids of the fixes before and after the sample, within ``WINDOW_S``
   seconds) shows real movement. A device
   distance stream (FIT) is preferred when it is complete, monotonic and within
   15 % of the GPS estimate (footpods/fused distance are usually better).
6. Elevation: time-window median (+/- 10 s) removes spikes; gain/loss use a
   hysteresis threshold (``ELEV_THRESHOLD_M``) so sub-threshold noise cannot
   accumulate into fictitious climbing.
7. Moving time: an interval is moving when windowed speed >= ``STOP_SPEED``
   and it is not an auto-pause gap (> ``MAX_GAP_S`` without matching progress).
   Consecutive stopped intervals totalling >= ``MIN_STOP_S`` are stoppages.
"""

from __future__ import annotations

import bisect
import math
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfoNotFoundError
from .timezones import zone_at

from .geo import LocalProjection, segment_m
from .model import ActivityFileError, ParsedActivity, Sample

MAX_SPEED = {"running": 12.5, "trail_running": 12.5, "walking": 4.5, "hiking": 4.5, "cycling": 30.0}
CONFIRM = 3
WINDOW_S = 5.0
STOP_SPEED = 0.5  # m/s (1.8 km/h): below this a runner is standing, not moving
MAX_GAP_S = 60.0
MIN_STOP_S = 10.0
ELEV_THRESHOLD_M = 3.0
CLOCK_CONTINUITY_M = 50.0


@dataclass
class Track:
    t: list[float]
    lat: list[float | None]
    lon: list[float | None]
    ele: list[float | None]
    hr: list[float | None]
    cad: list[float | None]
    dist: list[float]
    moving: list[bool]
    sport: str
    utc_offset_s: int
    timezone_assumed: bool
    distance_source: str
    stoppages: list[dict] = field(default_factory=list)
    quality: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def has_gps(self) -> bool:
        return any(v is not None for v in self.lat)


def _valid_position(s: Sample) -> bool:
    return (
        s.lat is not None
        and s.lon is not None
        and -90 <= s.lat <= 90
        and -180 <= s.lon <= 180
        and not (abs(s.lat) < 1e-7 and abs(s.lon) < 1e-7)
    )


def repair_clock(samples: list[Sample]) -> tuple[list[Sample], int, bool]:
    """Return (samples, clock_corrections, needed_sort)."""
    if len(samples) < 3:
        return sorted(samples, key=lambda s: s.t), 0, False
    deltas = [b.t - a.t for a, b in zip(samples, samples[1:]) if b.t > a.t]
    step = statistics.median(deltas) if deltas else 1.0
    shift, fixes, out = 0.0, 0, [samples[0]]
    for prev, cur in zip(samples, samples[1:]):
        t = cur.t + shift
        if t < out[-1].t - 1 and _valid_position(prev) and _valid_position(cur) and segment_m(prev.lat, prev.lon, cur.lat, cur.lon) < CLOCK_CONTINUITY_M:
            shift += out[-1].t + step - t
            t = out[-1].t + step
            fixes += 1
        out.append(Sample(t, cur.lat, cur.lon, cur.ele, cur.hr, cur.cad, cur.device_dist))
    unordered = any(b.t < a.t for a, b in zip(out, out[1:]))
    return (sorted(out, key=lambda s: s.t) if unordered else out), fixes, unordered


def _merge_duplicates(samples: list[Sample]) -> tuple[list[Sample], int]:
    out: list[Sample] = []
    dupes = 0
    for s in samples:
        if out and abs(s.t - out[-1].t) < 1e-6:
            dupes += 1
            last = out[-1]
            for attr in ("lat", "lon", "ele", "hr", "cad", "device_dist"):
                if getattr(last, attr) is None:
                    setattr(last, attr, getattr(s, attr))
            continue
        out.append(s)
    return out, dupes


def reject_outliers(samples: list[Sample], max_speed: float) -> int:
    """Clear positions of implausible fixes in place; returns the number rejected."""
    idx = [i for i, s in enumerate(samples) if _valid_position(s)]
    for i, s in enumerate(samples):
        if not _valid_position(s):
            s.lat = s.lon = None
    rejected, last = 0, None
    for k, i in enumerate(idx):
        s = samples[i]
        if last is None:
            last = i
            continue
        p = samples[last]
        dt = max(s.t - p.t, 1e-3)
        if segment_m(p.lat, p.lon, s.lat, s.lon) / dt <= max_speed:
            last = i
            continue
        # Accept a jump only if the following fixes are consistent with the new position.
        ahead = idx[k + 1 : k + 1 + CONFIRM]
        if len(ahead) == CONFIRM and all(
            segment_m(s.lat, s.lon, samples[j].lat, samples[j].lon) / max(samples[j].t - s.t, 1e-3) <= max_speed for j in ahead
        ):
            last = i
            continue
        s.lat = s.lon = None
        rejected += 1
    return rejected


def _window_speeds(t: list[float], xs: list[float]) -> list[float]:
    """Speed at each sample from progress ``xs`` across a +/- WINDOW_S window."""
    n, out = len(t), []
    lo = hi = 0
    for i in range(n):
        while t[lo] < t[i] - WINDOW_S:
            lo += 1
        while hi + 1 < n and t[hi + 1] <= t[i] + WINDOW_S:
            hi += 1
        dt = t[hi] - t[lo]
        out.append((xs[hi] - xs[lo]) / dt if dt > 0 else 0.0)
    return out


def _gps_distance(samples: list[Sample]) -> tuple[list[float], list[float]]:
    """Return (cumulative jitter-filtered distance, windowed displacement speed)."""
    n = len(samples)
    pos = [i for i in range(n) if samples[i].lat is not None]
    raw = [0.0] * n
    for a, b in zip(pos, pos[1:]):
        raw[b] = segment_m(samples[a].lat, samples[a].lon, samples[b].lat, samples[b].lon)
    # Windowed speed: distance between the centroid of fixes in [t-W, t] and the
    # centroid of fixes in [t, t+W], over the difference of their mean times.
    # Averaging suppresses independent jitter by ~sqrt(n); prefix sums keep it O(n log n).
    proj = LocalProjection(samples[pos[0]].lat, samples[pos[0]].lon) if pos else None
    tp = [samples[i].t for i in pos]
    xy = [proj.to_xy(samples[i].lat, samples[i].lon) for i in pos] if proj else []
    px, py, pt = [0.0], [0.0], [0.0]
    for (x, y), ti in zip(xy, tp):
        px.append(px[-1] + x)
        py.append(py[-1] + y)
        pt.append(pt[-1] + ti)

    def centroid(a: int, b: int) -> tuple[float, float, float]:  # over pos[a:b]
        m = b - a
        return (px[b] - px[a]) / m, (py[b] - py[a]) / m, (pt[b] - pt[a]) / m

    speed_at_pos: list[float] = []
    for k in range(len(pos)):
        lo = bisect.bisect_left(tp, tp[k] - WINDOW_S)
        hi = bisect.bisect_right(tp, tp[k] + WINDOW_S)
        x1, y1, t1 = centroid(lo, k + 1)
        x2, y2, t2 = centroid(k, hi)
        speed_at_pos.append(math.hypot(x2 - x1, y2 - y1) / (t2 - t1) if t2 > t1 else 0.0)
    speed = [0.0] * n
    for k, i in enumerate(pos):
        speed[i] = speed_at_pos[k]
    cum, total = [0.0] * n, 0.0
    prev_pos = None
    for i in range(n):
        if samples[i].lat is not None:
            if prev_pos is not None:
                seg = raw[i]
                dt = samples[i].t - samples[prev_pos].t
                # Count a segment if either end shows movement, or a long gap shows real progress.
                if max(speed[i], speed[prev_pos]) >= STOP_SPEED or (dt > 0 and seg / dt >= STOP_SPEED and dt > WINDOW_S):
                    total += seg
            prev_pos = i
        cum[i] = total
    # Samples inside a GPS outage (HR/cadence still recorded) get time-interpolated progress.
    for a, b in zip(pos, pos[1:]):
        span = samples[b].t - samples[a].t
        if b - a > 1 and span > 0:
            v = (cum[b] - cum[a]) / span
            for i in range(a + 1, b):
                cum[i] = cum[a] + v * (samples[i].t - samples[a].t)
                speed[i] = v
    return cum, speed


def _device_distance(samples: list[Sample]) -> list[float] | None:
    vals = [s.device_dist for s in samples]
    present = [v for v in vals if v is not None]
    if len(present) < 0.9 * len(samples) or any(b < a - 0.5 for a, b in zip(present, present[1:])):
        return None
    out, last = [], present[0]
    for v in vals:
        last = v if v is not None else last
        out.append(max(last - present[0], out[-1] if out else 0.0))
    return out


def smooth_elevation(t: list[float], ele: list[float | None], half_window_s: float = 10.0) -> list[float | None]:
    pts = [(ti, e) for ti, e in zip(t, ele) if e is not None and math.isfinite(e) and -500 < e < 9000]
    if not pts:
        return [None] * len(t)
    ts = [p[0] for p in pts]
    out: list[float | None] = []
    for ti in t:
        lo = bisect.bisect_left(ts, ti - half_window_s)
        hi = bisect.bisect_right(ts, ti + half_window_s)
        window = [p[1] for p in pts[lo:hi]]
        if not window:
            k = min(max(bisect.bisect_left(ts, ti), 0), len(pts) - 1)
            window = [pts[k][1]]
        out.append(statistics.median(window))
    return out


def elevation_gain_loss(ele: list[float | None], threshold: float = ELEV_THRESHOLD_M) -> tuple[float, float]:
    """Hysteresis accumulation: only count a change once it exceeds ``threshold`` from the anchor."""
    vals = [e for e in ele if e is not None]
    if not vals:
        return 0.0, 0.0
    gain = loss = 0.0
    anchor = vals[0]
    for e in vals[1:]:
        if e - anchor > threshold:
            gain += e - anchor
            anchor = e
        elif anchor - e > threshold:
            loss += anchor - e
            anchor = e
    return gain, loss


def _offset(parsed: ParsedActivity, start: float, fallback_tz: str | None) -> tuple[int, bool]:
    if parsed.utc_offset_s is not None:
        return parsed.utc_offset_s, False
    try:
        zone = zone_at(fallback_tz, start) if fallback_tz else timezone.utc
    except (ZoneInfoNotFoundError, ValueError):
        zone = timezone.utc
    delta = datetime.fromtimestamp(start, tz=timezone.utc).astimezone(zone).utcoffset() or timedelta(0)
    return int(delta.total_seconds()), True


def process(parsed: ParsedActivity, fallback_tz: str | None = None) -> Track:
    samples = [s for s in parsed.samples if isinstance(s.t, float) and math.isfinite(s.t)]
    dropped_time = len(parsed.samples) - len(samples)
    if len(samples) < 2:
        raise ActivityFileError("The file needs at least two timestamped samples to be an activity.")
    samples, clock_fixes, sorted_needed = repair_clock(samples)
    samples, dupes = _merge_duplicates(samples)
    if samples[-1].t - samples[0].t <= 0:
        raise ActivityFileError("All samples share one timestamp; elapsed time is zero.")
    if samples[-1].t - samples[0].t > 7 * 86400:
        raise ActivityFileError("Activity spans more than seven days; timestamps look corrupted.")
    positioned_before = sum(_valid_position(s) for s in samples)
    outliers = reject_outliers(samples, MAX_SPEED.get(parsed.sport, 12.5))

    t = [s.t for s in samples]
    gps_dist, speed = _gps_distance(samples) if positioned_before else ([0.0] * len(samples), [0.0] * len(samples))
    device = _device_distance(samples)
    gps_total = gps_dist[-1]
    if device and (gps_total == 0 or abs(device[-1] - gps_total) <= 0.15 * max(gps_total, 1)):
        dist, source = device, "device"
        speed = _window_speeds(t, dist)
    elif gps_total > 0:
        dist, source = gps_dist, "gps"
    else:
        raise ActivityFileError("No usable GPS positions or device distance; distance cannot be computed.")

    moving = [False]
    for i in range(1, len(t)):
        dt = t[i] - t[i - 1]
        progress = dist[i] - dist[i - 1]
        if dt > MAX_GAP_S:
            moving.append(progress / dt >= STOP_SPEED)
        else:
            moving.append(max(speed[i], speed[i - 1]) >= STOP_SPEED and progress > 0)

    stoppages, run_start = [], None
    for i in range(1, len(t) + 1):
        stopped = i < len(t) and not moving[i]
        if stopped and run_start is None:
            run_start = i - 1
        elif not stopped and run_start is not None:
            end = i - 1
            duration = t[end] - t[run_start]
            if duration >= MIN_STOP_S:
                s = samples[run_start]
                stoppages.append(
                    {
                        "start_offset_s": round(t[run_start] - t[0], 1),
                        "duration_s": round(duration, 1),
                        "at_distance_m": round(dist[run_start], 1),
                        "lat": s.lat,
                        "lon": s.lon,
                    }
                )
            run_start = None

    offset, assumed = _offset(parsed, t[0], fallback_tz)
    ele = smooth_elevation(t, [s.ele for s in samples])
    hr = [s.hr if s.hr and 25 <= s.hr <= 250 else None for s in samples]
    cad = [s.cad if s.cad and 0 < s.cad <= 260 else None for s in samples]
    warnings = list(parsed.warnings)
    if clock_fixes:
        warnings.append(f"Repaired {clock_fixes} backwards device clock jump(s).")
    if sorted_needed:
        warnings.append("Samples were out of time order and were sorted.")
    if outliers:
        warnings.append(f"Rejected {outliers} implausible GPS fix(es).")
    if assumed:
        warnings.append("The file has no time zone; local time uses your browser time zone.")
    return Track(
        t=t,
        lat=[s.lat for s in samples],
        lon=[s.lon for s in samples],
        ele=ele,
        hr=hr,
        cad=cad,
        dist=dist,
        moving=moving,
        sport=parsed.sport,
        utc_offset_s=offset,
        timezone_assumed=assumed,
        distance_source=source,
        stoppages=stoppages,
        quality={
            "samples": len(parsed.samples),
            "kept": len(samples),
            "dropped_no_time": dropped_time,
            "duplicate_timestamps": dupes,
            "clock_corrections": clock_fixes,
            "gps_outliers": outliers,
            "gps_coverage": round(sum(v is not None for v in (s.lat for s in samples)) / len(samples), 3),
            "hr_coverage": round(sum(v is not None for v in hr) / len(samples), 3),
            "gps_distance_m": round(gps_total, 1),
            "device_distance_m": round(device[-1], 1) if device else None,
        },
        warnings=warnings,
    )

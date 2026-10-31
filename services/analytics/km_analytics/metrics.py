"""Deterministic running metrics computed from a cleaned ``Track``.

Formulas (see docs/RUNNING_METRICS.md for the full derivations):

* Pace = moving time / distance (s/km). Elapsed pace is reported separately.
* Splits: time at each km boundary is linearly interpolated between samples.
* Best efforts: minimum elapsed time over any window covering >= the target
  distance; two-pointer sweep with interpolated window start, O(n).
* Grade-adjusted (elevation-adjusted) pace: Minetti et al. (2002), J Appl
  Physiol 93:1039, metabolic cost of running on a slope
  C(i) = 155.4i^5 - 30.4i^4 - 43.3i^3 + 46.3i^2 + 19.5i + 3.6 (J/kg/m), with
  grade i clamped to [-0.45, 0.45], the measured range. Equivalent flat
  distance = sum(d * C(i) / C(0)) over >= 50 m grade segments.
* Aerobic decoupling (Pa:HR): efficiency factor EF = speed / HR for the first
  and second halves of moving time; decoupling = (EF1 - EF2) / EF1. Reported
  only with >= 80 % HR coverage and >= 20 min moving time.
* Pace variability: coefficient of variation of moving pace across full km
  splits.
"""

from __future__ import annotations

import bisect
import math
import statistics

from .clean import Track, elevation_gain_loss

BEST_EFFORTS = {
    "400m": 400.0,
    "1k": 1000.0,
    "1mi": 1609.344,
    "5k": 5000.0,
    "10k": 10000.0,
    "half": 21097.5,
    "marathon": 42195.0,
}
GRADE_SEGMENT_M = 50.0


def minetti_cost(grade: float) -> float:
    i = max(-0.45, min(0.45, grade))
    return 155.4 * i**5 - 30.4 * i**4 - 43.3 * i**3 + 46.3 * i**2 + 19.5 * i + 3.6


def _interp(xs: list[float], ys: list[float], x: float, latest: bool = False) -> float:
    """Linear interpolation of y at x, xs non-decreasing.

    Where xs plateaus (distance while stopped), ``latest`` picks the last y at
    that x instead of the first.
    """
    k = bisect.bisect_right(xs, x) if latest else bisect.bisect_left(xs, x)
    if latest and 0 < k < len(xs) and xs[k - 1] == x:
        return ys[k - 1]
    if k <= 0:
        return ys[0]
    if k >= len(xs):
        return ys[-1]
    x0, x1 = xs[k - 1], xs[k]
    if x1 == x0:
        return ys[k]
    return ys[k - 1] + (ys[k] - ys[k - 1]) * (x - x0) / (x1 - x0)


def moving_time_series(track: Track) -> list[float]:
    """Cumulative moving seconds at each sample."""
    out, total = [0.0], 0.0
    for i in range(1, len(track.t)):
        if track.moving[i]:
            total += track.t[i] - track.t[i - 1]
        out.append(total)
    return out


def splits(track: Track, unit_m: float = 1000.0) -> list[dict]:
    dist, t = track.dist, track.t
    mov = moving_time_series(track)
    total = dist[-1]
    out = []
    edges = [k * unit_m for k in range(int(total // unit_m) + 1)]
    if total - edges[-1] > 1:
        edges.append(total)
    for k, (a, b) in enumerate(zip(edges, edges[1:])):
        ta, tb = _interp(dist, t, a), _interp(dist, t, b)
        ma, mb = _interp(dist, mov, a), _interp(dist, mov, b)
        lo, hi = bisect.bisect_left(dist, a), bisect.bisect_right(dist, b)
        hrs = [h for h in track.hr[lo:hi] if h]
        gain, loss = elevation_gain_loss(track.ele[lo:hi])
        out.append(
            {
                "index": k,
                "distance_m": round(b - a, 1),
                "elapsed_s": round(tb - ta, 1),
                "moving_s": round(mb - ma, 1),
                "pace_s_per_km": round((mb - ma) / ((b - a) / 1000), 1) if b > a and mb > ma else None,
                "avg_hr": round(statistics.fmean(hrs), 1) if hrs else None,
                "elevation_gain_m": round(gain, 1),
                "elevation_loss_m": round(loss, 1),
            }
        )
    return out


def best_efforts(track: Track) -> dict[str, dict]:
    dist, t = track.dist, track.t
    out: dict[str, dict] = {}
    for name, target in BEST_EFFORTS.items():
        if dist[-1] < target:
            continue
        best, best_start = math.inf, 0.0
        # Under piecewise-linear progress the optimum has one end on a sample:
        # anchor each sample as a window end, then as a window start.
        for i in range(len(dist)):
            if dist[i] >= target:
                elapsed = t[i] - _interp(dist, t, dist[i] - target, latest=True)
                if elapsed < best:
                    best, best_start = elapsed, dist[i] - target
            if dist[i] + target <= dist[-1]:
                elapsed = _interp(dist, t, dist[i] + target) - t[i]
                if elapsed < best:
                    best, best_start = elapsed, dist[i]
        out[name] = {"elapsed_s": round(best, 1), "start_m": round(best_start, 1)}
    return out


def grade_adjusted_distance(track: Track) -> float | None:
    if not any(e is not None for e in track.ele):
        return None
    dist, ele = track.dist, track.ele
    total, anchor = 0.0, 0
    flat_cost = minetti_cost(0.0)
    for i in range(1, len(dist)):
        d = dist[i] - dist[anchor]
        if d < GRADE_SEGMENT_M and i < len(dist) - 1:
            continue
        if ele[i] is not None and ele[anchor] is not None and d > 0:
            total += d * minetti_cost((ele[i] - ele[anchor]) / d) / flat_cost
        else:
            total += d
        anchor = i
    return total


def decoupling(track: Track) -> dict | None:
    mov = moving_time_series(track)
    hr_cov = sum(h is not None for h in track.hr) / len(track.hr)
    if hr_cov < 0.8 or mov[-1] < 1200:
        return None
    half = mov[-1] / 2
    ef = []
    for lo_t, hi_t in ((0.0, half), (half, mov[-1])):
        lo, hi = bisect.bisect_left(mov, lo_t), bisect.bisect_left(mov, hi_t)
        d = track.dist[hi] - track.dist[lo]
        hrs = [track.hr[i] for i in range(lo, hi + 1) if track.hr[i] and track.moving[i]]
        if not hrs or d <= 0:
            return None
        ef.append((d / (mov[hi] - mov[lo])) / statistics.fmean(hrs))
    return {"ef_first": round(ef[0] * 60, 4), "ef_second": round(ef[1] * 60, 4), "decoupling_pct": round((ef[0] - ef[1]) / ef[0] * 100, 2)}


def pace_variability(km_splits: list[dict]) -> float | None:
    paces = [s["pace_s_per_km"] for s in km_splits if s["pace_s_per_km"] and s["distance_m"] >= 999]
    if len(paces) < 3:
        return None
    return round(statistics.pstdev(paces) / statistics.fmean(paces), 4)


def split_type(track: Track) -> dict | None:
    mov = moving_time_series(track)
    half_d = track.dist[-1] / 2
    if half_d < 500:
        return None
    m_half = _interp(track.dist, mov, half_d)
    first, second = m_half, mov[-1] - m_half
    if first <= 0 or second <= 0:
        return None
    diff = (second - first) / first  # positive: second half slower
    kind = "even" if abs(diff) < 0.01 else ("positive" if diff > 0 else "negative")
    return {"kind": kind, "first_half_s": round(first, 1), "second_half_s": round(second, 1), "difference_pct": round(diff * 100, 2)}


def classify(track: Track, km_splits: list[dict], laps: list[dict]) -> dict:
    """Heuristic workout classification. Labelled as an estimate everywhere it is shown."""
    if track.sport not in ("running", "trail_running"):
        return {"kind": track.sport, "basis": "sport recorded by the device"}
    lap_paces = [lap["pace_s_per_km"] for lap in laps if lap.get("pace_s_per_km") and lap["distance_m"] >= 100]
    if len(lap_paces) >= 5:
        fast = min(lap_paces)
        reps = sum(1 for p in lap_paces if p <= fast * 1.08)
        slow = sum(1 for p in lap_paces if p >= fast * 1.2)
        if reps >= 3 and slow >= 2:
            return {"kind": "intervals", "basis": f"{reps} fast laps alternating with {slow} recovery laps"}
    mov = moving_time_series(track)[-1]
    if mov >= 90 * 60:
        return {"kind": "long", "basis": "moving time of 90 minutes or more"}
    cv = pace_variability(km_splits)
    if cv is not None and cv > 0.12:
        return {"kind": "fartlek_or_mixed", "basis": f"km pace coefficient of variation {cv:.2f}"}
    return {"kind": "steady", "basis": "even km paces without a lap structure"}


def lap_summaries(track: Track, laps) -> list[dict]:
    out = []
    mov = moving_time_series(track)
    for k, lap in enumerate(laps):
        a = bisect.bisect_left(track.t, lap.start)
        b = max(bisect.bisect_right(track.t, lap.end) - 1, a)
        d = track.dist[b] - track.dist[a]
        m = mov[b] - mov[a]
        hrs = [h for h in track.hr[a : b + 1] if h]
        out.append(
            {
                "index": k,
                "start_offset_s": round(lap.start - track.t[0], 1),
                "distance_m": round(lap.distance_m if lap.distance_m else d, 1),
                "elapsed_s": round(lap.end - lap.start, 1),
                "moving_s": round(m, 1),
                "pace_s_per_km": round(m / (d / 1000), 1) if d > 0 and m > 0 else None,
                "avg_hr": round(statistics.fmean(hrs), 1) if hrs else None,
            }
        )
    return out


def summarize(track: Track, laps=()) -> dict:
    mov = moving_time_series(track)
    km = splits(track)
    lap_rows = lap_summaries(track, laps)
    gain, loss = elevation_gain_loss(track.ele)
    gad = grade_adjusted_distance(track)
    hrs = [h for h in track.hr if h]
    cads = [c for c, m in zip(track.cad, track.moving) if c and m]
    distance = track.dist[-1]
    return {
        "distance_m": round(distance, 1),
        "elapsed_s": round(track.t[-1] - track.t[0], 1),
        "moving_s": round(mov[-1], 1),
        "pace_s_per_km": round(mov[-1] / (distance / 1000), 1) if distance > 0 and mov[-1] > 0 else None,
        "elevation_gain_m": round(gain, 1),
        "elevation_loss_m": round(loss, 1),
        "grade_adjusted_pace_s_per_km": round(mov[-1] / (gad / 1000), 1) if gad and mov[-1] > 0 else None,
        "avg_hr": round(statistics.fmean(hrs), 1) if hrs else None,
        "max_hr": max(hrs) if hrs else None,
        "avg_cadence": round(statistics.fmean(cads), 1) if cads else None,
        "stoppage_count": len(track.stoppages),
        "stopped_s": round(sum(s["duration_s"] for s in track.stoppages), 1),
        "pace_cv": pace_variability(km),
        "split_type": split_type(track),
        "decoupling": decoupling(track),
        "best_efforts": best_efforts(track),
        "classification": classify(track, km, lap_rows),
        "splits": km,
        "laps": lap_rows,
    }

"""KM Ghost: align a historical run (ghost) to a reference run on the same route.

Method (docs/GHOST.md):
1. Comparability: each track must lie within 40 m of the other for >= 80 % of its
   length (sampled every 25 m) and lengths must agree within +/-15 %.
2. Map matching: every ghost sample is projected onto the reference polyline,
   searching only a window [s - 30 m, s + 300 m] around its last matched arc
   length s. The forward-only window keeps progress monotonic, so loops and
   out-and-backs that revisit a place cannot make the ghost jump. Samples further
   than 60 m from the route are unmatched (position held) and reported.
3. Both runners' time-at-arc-length curves are sampled every 25 m of the
   reference; gap(s) = t_ghost(s) - t_reference(s) (positive: the reference run
   was ahead at that point).
4. Replay frames every 5 s place both runners on the reference line, so the
   replay shows aligned progress rather than raw GPS noise. It is a simulation of
   recorded data, never live tracking.
"""

from __future__ import annotations

import bisect
import math

from .analyze import route_overlap
from .geo import LocalProjection, project_point_segment

GRID_M = 25.0
WINDOW_BACK_M = 30.0
WINDOW_AHEAD_M = 300.0
MATCH_M = 60.0
FRAME_S = 5.0


def _track(streams: dict) -> tuple[list[float], list[tuple[float, float]], list[float]]:
    """Positioned samples with their processed (jitter-filtered) cumulative distance."""
    t, pts, dist = [], [], []
    raw = streams.get("dist") or [None] * len(streams["t"])
    for ti, lat, lon, d in zip(streams["t"], streams["lat"], streams["lon"], raw):
        if lat is not None and lon is not None:
            t.append(float(ti))
            pts.append((lat, lon))
            dist.append(d)
    if any(d is None for d in dist):  # no processed distance: fall back to geometry
        proj = LocalProjection(*pts[0])
        xy = [proj.to_xy(*p) for p in pts]
        dist = [0.0]
        for (x1, y1), (x2, y2) in zip(xy, xy[1:]):
            dist.append(dist[-1] + math.hypot(x2 - x1, y2 - y1))
    base = dist[0]
    return t, pts, [max(0.0, d - base) for d in dist]


class Polyline:
    """Reference route. Geometry decides where a point projects; arc length along it is
    the run's processed distance, so GPS jitter cannot inflate positions or splits."""

    def __init__(self, pts: list[tuple[float, float]], arc: list[float]):
        self.proj = LocalProjection(*pts[0])
        self.xy = [self.proj.to_xy(*p) for p in pts]
        self.cum = list(arc)

    @property
    def length(self) -> float:
        return self.cum[-1]

    def locate(self, lat: float, lon: float, lo_s: float, hi_s: float) -> tuple[float, float]:
        """Closest point within the arc window: (arc length, lateral distance)."""
        x, y = self.proj.to_xy(lat, lon)
        i0 = max(0, bisect.bisect_right(self.cum, lo_s) - 1)
        i1 = min(len(self.xy) - 1, bisect.bisect_left(self.cum, hi_s) + 1)
        best_s, best_d = lo_s, math.inf
        for i in range(i0, i1):
            u, d = project_point_segment(x, y, *self.xy[i], *self.xy[i + 1])
            if d < best_d:
                best_d, best_s = d, self.cum[i] + u * (self.cum[i + 1] - self.cum[i])
        return best_s, best_d

    def point(self, s: float) -> list[float]:
        s = min(max(s, 0.0), self.length)
        i = min(max(bisect.bisect_right(self.cum, s) - 1, 0), len(self.xy) - 2)
        seg = self.cum[i + 1] - self.cum[i]
        f = (s - self.cum[i]) / seg if seg > 0 else 0.0
        x = self.xy[i][0] + f * (self.xy[i + 1][0] - self.xy[i][0])
        y = self.xy[i][1] + f * (self.xy[i + 1][1] - self.xy[i][1])
        lat, lon = self.proj.to_latlon(x, y)
        return [round(lon, 6), round(lat, 6)]


def _time_at(s_list: list[float], t_list: list[float], s: float) -> float | None:
    """First time a monotone progress curve reaches arc length s (linear interpolation)."""
    k = bisect.bisect_left(s_list, s)
    if k >= len(s_list):
        return None
    if k == 0:
        return t_list[0]
    s0, s1 = s_list[k - 1], s_list[k]
    return t_list[k - 1] + (t_list[k] - t_list[k - 1]) * ((s - s0) / (s1 - s0) if s1 > s0 else 0.0)


def _progress_at(t_list: list[float], s_list: list[float], t: float) -> float:
    k = bisect.bisect_right(t_list, t)
    if k <= 0:
        return s_list[0]
    if k >= len(t_list):
        return s_list[-1]
    t0, t1 = t_list[k - 1], t_list[k]
    return s_list[k - 1] + (s_list[k] - s_list[k - 1]) * ((t - t0) / (t1 - t0) if t1 > t0 else 0.0)


def align(ref: dict, ghost: dict) -> dict:
    """``ref``/``ghost``: {"streams": {t, lat, lon, ...}, "label": str}."""
    if sum(v is not None for v in ref["streams"]["lat"]) < 10 or sum(v is not None for v in ghost["streams"]["lat"]) < 10:
        return {"status": "not_comparable", "reasons": ["Both runs need GPS tracks."]}
    ta, pa, da = _track(ref["streams"])
    tb, pb, db = _track(ghost["streams"])
    line = Polyline(pa, da)
    coords_a = [[lon, lat] for lat, lon in pa[:: max(1, len(pa) // 2000)]]
    coords_b = [[lon, lat] for lat, lon in pb[:: max(1, len(pb) // 2000)]]
    cov_ab = route_overlap(coords_a, coords_b, tolerance_m=40.0, step_m=GRID_M)
    cov_ba = route_overlap(coords_b, coords_a, tolerance_m=40.0, step_m=GRID_M)
    ratio = db[-1] / line.length if line.length else 0.0
    comparability = {"coverage_ref_on_ghost": round(cov_ab, 3), "coverage_ghost_on_ref": round(cov_ba, 3), "length_ratio": round(ratio, 3)}
    reasons = []
    if cov_ab < 0.8 or cov_ba < 0.8:
        reasons.append(f"The tracks overlap only {min(cov_ab, cov_ba) * 100:.0f}% within 40 m; at least 80% is required for a fair replay.")
    if not 0.85 <= ratio <= 1.15:
        reasons.append(f"Track lengths differ by {abs(ratio - 1) * 100:.0f}% (limit 15%).")
    if reasons:
        return {"status": "not_comparable", "reasons": reasons, "comparability": comparability}

    # Map-match the ghost onto the reference line with a forward-biased window.
    s_ref = list(line.cum)
    s_ghost, unmatched, lateral, s = [], [], [], 0.0
    for i, (lat, lon) in enumerate(pb):
        cand, d = line.locate(lat, lon, max(0.0, s - WINDOW_BACK_M), s + WINDOW_AHEAD_M)
        if d <= MATCH_M:
            s = max(s, cand)  # never move backwards along the route
            lateral.append(d)
        else:
            unmatched.append(i)
        s_ghost.append(s)
    off = []
    for i in unmatched:
        if off and i == off[-1][1] + 1:
            off[-1][1] = i
        else:
            off.append([i, i])
    off_spans = [{"from_s": round(tb[a] - tb[0], 1), "to_s": round(tb[b] - tb[0], 1), "at_m": round(s_ghost[a], 1)} for a, b in off if tb[b] - tb[a] >= 10]

    t0a, t0b = ta[0], tb[0]
    rel_a = [t - t0a for t in ta]
    rel_b = [t - t0b for t in tb]
    end = min(s_ref[-1], s_ghost[-1])
    gaps = []
    s = 0.0
    while s <= end:
        a_t, b_t = _time_at(s_ref, rel_a, s), _time_at(s_ghost, rel_b, s)
        if a_t is not None and b_t is not None:
            gaps.append({"s": round(s, 1), "t_ref": round(a_t, 1), "t_ghost": round(b_t, 1), "gap_s": round(b_t - a_t, 1)})
        s += GRID_M
    splits = []
    for k in range(int(end // 1000)):
        a0, a1 = _time_at(s_ref, rel_a, k * 1000.0), _time_at(s_ref, rel_a, (k + 1) * 1000.0)
        b0, b1 = _time_at(s_ghost, rel_b, k * 1000.0), _time_at(s_ghost, rel_b, (k + 1) * 1000.0)
        if None not in (a0, a1, b0, b1):
            splits.append({"km": k + 1, "ref_s": round(a1 - a0, 1), "ghost_s": round(b1 - b0, 1), "delta_s": round((b1 - b0) - (a1 - a0), 1)})
    frames = []
    horizon = max(rel_a[-1], rel_b[-1])
    t = 0.0
    while t <= horizon + 1e-6:
        sa, sb = _progress_at(rel_a, s_ref, t), _progress_at(rel_b, s_ghost, t)
        frames.append({"t": round(t, 1), "ref": line.point(sa), "ghost": line.point(sb), "ahead_m": round(sa - sb, 1)})
        t += FRAME_S
    finish_ref = _time_at(s_ref, rel_a, end)
    finish_ghost = _time_at(s_ghost, rel_b, end)
    return {
        "status": "ok",
        "comparability": {**comparability, "matched_fraction": round(1 - len(unmatched) / len(pb), 3), "median_lateral_m": round(sorted(lateral)[len(lateral) // 2], 1) if lateral else None},
        "reference_line": {"type": "LineString", "coordinates": [line.point(x) for x in range(0, int(line.length), 20)] + [line.point(line.length)]},
        "aligned_distance_m": round(end, 1),
        "gaps": gaps,
        "splits": splits,
        "frames": frames,
        "finish": {"ref_s": finish_ref, "ghost_s": finish_ghost, "gap_s": round(finish_ghost - finish_ref, 1) if finish_ref is not None and finish_ghost is not None else None},
        "off_route": off_spans,
        "notes": ["Simulated replay of two recorded runs aligned by position on the reference route. Not live tracking."],
    }

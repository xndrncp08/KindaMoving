"""Route validation and waypoint routing (interactive editing).

Validation samples the line every 20 m and measures the distance to the
nearest mapped runnable way. Sections that stay > 25 m from any way for more
than 60 m are reported as unmapped or invented connections; straight jumps
between vertices longer than 200 m are reported separately. Nothing is
"repaired" silently.
"""

from __future__ import annotations

import math

from ..geo import LocalProjection, project_point_segment, segment_m
from .engine import Costs, NodeIndex, RouteRequest, evaluate, geometry, route_between
from .graph import Graph

SAMPLE_M = 20.0
ON_NETWORK_M = 25.0
MIN_ISSUE_M = 60.0
JUMP_M = 200.0


def _segment_index(g: Graph, proj: LocalProjection, cell: float = 50.0):
    grid: dict[tuple[int, int], list[tuple[float, float, float, float]]] = {}
    for e in g.edges:
        if not e.traversable:
            continue
        pts = [proj.to_xy(lat, lon) for lon, lat in e.coords]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            for gx in range(int(min(ax, bx) // cell) - 1, int(max(ax, bx) // cell) + 2):
                for gy in range(int(min(ay, by) // cell) - 1, int(max(ay, by) // cell) + 2):
                    grid.setdefault((gx, gy), []).append((ax, ay, bx, by))
    return grid, cell


def validate(g: Graph, coords: list[list[float]]) -> dict:
    if len(coords) < 2:
        return {"valid": False, "issues": [{"kind": "too_short", "message": "A route needs at least two points."}]}
    proj = LocalProjection(coords[0][1], coords[0][0])
    grid, cell = _segment_index(g, proj)
    issues, samples, total = [], [], 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coords, coords[1:]):
        d = segment_m(lat1, lon1, lat2, lon2)
        if d > JUMP_M:
            issues.append({"kind": "jump", "at_m": round(total, 1), "length_m": round(d, 1), "message": f"Straight {d:.0f} m jump at km {total / 1000:.2f}; it does not follow a mapped way."})
        x1, y1 = proj.to_xy(lat1, lon1)
        x2, y2 = proj.to_xy(lat2, lon2)
        k = max(1, math.ceil(d / SAMPLE_M))
        for i in range(k):
            f = i / k
            samples.append((total + d * f, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f))
        total += d
    off = []
    for at, x, y in samples:
        best = math.inf
        for seg in grid.get((int(x // cell), int(y // cell)), ()):
            best = min(best, project_point_segment(x, y, *seg)[1])
        off.append((at, best > ON_NETWORK_M))
    run_start = None
    for i, (at, is_off) in enumerate(off + [(total, False)]):
        if is_off and run_start is None:
            run_start = at
        elif not is_off and run_start is not None:
            if at - run_start >= MIN_ISSUE_M:
                issues.append({
                    "kind": "off_network",
                    "at_m": round(run_start, 1),
                    "length_m": round(at - run_start, 1),
                    "message": f"{at - run_start:.0f} m from km {run_start / 1000:.2f} is not on a mapped runnable way (unmapped path, private land or an invented connection).",
                })
            run_start = None
    coverage = 1 - sum(1 for _, o in off if o) / len(off)
    closure = segment_m(coords[0][1], coords[0][0], coords[-1][1], coords[-1][0])
    return {
        "valid": not issues,
        "distance_m": round(total, 1),
        "network_coverage": round(coverage, 3),
        "is_loop": closure <= 50,
        "issues": issues,
    }


def route_waypoints(g: Graph, waypoints: list[dict], req: RouteRequest) -> dict:
    """Shortest preferred path through ordered waypoints (each leg on the mapped network)."""
    if len(waypoints) < 2:
        return {"status": "error", "message": "Add at least two waypoints."}
    idx = NodeIndex(g)
    costs = Costs(g, req)
    nodes = []
    for i, w in enumerate(waypoints):
        n, d = idx.nearest(w["lat"], w["lon"], max_m=250)
        if n is None:
            return {"status": "error", "message": f"Waypoint {i + 1} is {d:.0f} m from the nearest mapped runnable way."}
        nodes.append(n)
    steps = []
    for i, (a, b) in enumerate(zip(nodes, nodes[1:])):
        leg = route_between(g, costs, a, b, reuse={ei for ei, _ in steps}, prev_edge=steps[-1][0] if steps else None)
        if leg is None:
            return {"status": "error", "message": f"No mapped connection between waypoints {i + 1} and {i + 2}; KindaMoving will not draw one."}
        steps += leg
    if not steps:
        return {"status": "error", "message": "The waypoints are too close together to form a route."}
    m = evaluate(g, nodes[0], steps, req, costs)
    m.pop("edge_ids")
    snapped = [{"lat": round(g.nodes[n].lat, 6), "lon": round(g.nodes[n].lon, 6)} for n in nodes]
    return {"status": "ok", "geometry": {"type": "LineString", "coordinates": geometry(g, steps)}, "metrics": m, "waypoints": snapped}

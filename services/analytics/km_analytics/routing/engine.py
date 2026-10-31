"""Workout-aware route generation on a real runnable network.

Algorithm (details and weights in docs/ROUTING.md):

* Costs: an edge costs its length scaled by a preference multiplier (path type,
  surface, lighting, reported hazards), plus climbing (flat preference) and a
  crossing penalty when the step passes another road. Re-used edges cost 4x so
  loops prefer fresh ground.
* Tempo section: in the subgraph where crossing a major road is forbidden, a
  bounded Dijkstra from seed nodes near the start finds shortest paths whose
  length is within +/-10 % of the requested tempo distance. Shortest paths are
  simple and direct; minor crossings are discouraged with a Lagrangian penalty
  and then counted exactly.
* Assembly: start -> seed (warm-up), tempo, end -> start (cool-down, re-use
  penalised). A shortfall is filled by a via-point w minimising
  |d(start,w) + d(w,seed) - needed| using two shortest-path trees (the
  "ellipse" method). Without a tempo section, loops come from triangles of
  via-points at 8 bearings, rescaled until the length is within tolerance.
* Every candidate is re-evaluated exactly (length, climb, crossings per step,
  surface, lighting, overlap, hazards), scored, de-duplicated by edge-set
  Jaccard similarity and explained.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..geo import LocalProjection, destination, project_point_segment
from .graph import TRAVERSABLE, Edge, Graph

REUSE_FACTOR = 4.0
CROSS_PENALTY = {1: 60.0, 2: 250.0}  # metres-equivalent
SIGNAL_PENALTY = 150.0
TEMPO_MINOR_LAMBDA = 300.0
TEMPO_TOLERANCE = 0.10
PATH_TYPES = {"footway", "path", "cycleway", "pedestrian", "track"}


@dataclass
class Hazard:
    lat: float
    lon: float
    radius_m: float
    weight: float  # 0..1: confidence x severity, from the conditions model
    kind: str
    label: str = ""


@dataclass
class RouteRequest:
    lat: float
    lon: float
    distance_m: float
    tolerance: float = 0.1
    shape: str = "loop"  # loop | out_and_back
    tempo_m: float | None = None
    tempo_max_major: int = 0
    tempo_max_minor: int = 2
    elevation: str = "any"  # any | flat | hilly
    surface: str = "any"  # any | paved | unpaved
    prefer_lit: bool = False
    hazards: list[Hazard] = field(default_factory=list)
    max_results: int = 5


class Costs:
    def __init__(self, g: Graph, req: RouteRequest):
        self.g, self.req = g, req
        self.hazard = hazard_weights(g, req.hazards)
        self.pen = [self._penalty(e) for e in g.edges]

    def _penalty(self, e: Edge) -> float:
        p = TRAVERSABLE.get(e.highway, 3.0)
        paved = e.paved
        if self.req.surface == "paved" and paved is False:
            p += 1.0
        elif self.req.surface == "unpaved" and paved is True:
            p += 0.6
        if self.req.prefer_lit and e.lit is not True:
            p += 0.5 if e.lit is None else 1.0
        return p + 4.0 * self.hazard.get(e.id, 0.0)

    def climb(self, e: Edge, frm: int) -> float:
        c = e.climb_from(frm)
        if self.req.elevation == "flat":
            return 12.0 * c
        if self.req.elevation == "hilly":
            return -min(0.4 * e.length, 6.0 * c)  # bounded so costs stay positive
        return 0.0

    def step(self, e: Edge, frm: int, prev: int | None, reuse: set[int] | frozenset = frozenset()) -> float:
        c = e.length * (1 + self.pen[e.id]) + self.climb(e, frm)
        if prev is not None:
            cls, signals = self.g.crossing(frm, prev, e.id)
            c += CROSS_PENALTY.get(cls, 0.0) + (SIGNAL_PENALTY if signals else 0.0)
        if e.id in reuse:
            c *= REUSE_FACTOR
        return max(c, 0.1 * e.length)


def hazard_weights(g: Graph, hazards: list[Hazard]) -> dict[int, float]:
    """Max hazard weight per edge whose geometry passes within the hazard radius."""
    out: dict[int, float] = {}
    if not hazards:
        return out
    for h in hazards:
        proj = LocalProjection(h.lat, h.lon)
        deg = h.radius_m / 111000 + 0.002
        for e in g.edges:
            if not e.traversable:
                continue
            lons = [c[0] for c in e.coords]
            lats = [c[1] for c in e.coords]
            if min(lats) - deg > h.lat or max(lats) + deg < h.lat or min(lons) - deg * 1.6 > h.lon or max(lons) + deg * 1.6 < h.lon:
                continue
            pts = [proj.to_xy(lat, lon) for lon, lat in e.coords]
            d = min(project_point_segment(0, 0, *a, *b)[1] for a, b in zip(pts, pts[1:]))
            if d <= h.radius_m:
                out[e.id] = max(out.get(e.id, 0.0), h.weight)
    return out


class NodeIndex:
    """Grid index for nearest traversable node queries."""

    def __init__(self, g: Graph, cell_m: float = 250.0):
        first = next(iter(g.adj))
        self.g, self.cell = g, cell_m
        self.proj = LocalProjection(g.nodes[first].lat, g.nodes[first].lon)
        self.grid: dict[tuple[int, int], list[int]] = {}
        for n in g.adj:
            x, y = self.proj.to_xy(g.nodes[n].lat, g.nodes[n].lon)
            self.grid.setdefault((int(x // cell_m), int(y // cell_m)), []).append(n)

    def nearest(self, lat: float, lon: float, max_m: float = 400.0) -> tuple[int | None, float]:
        x, y = self.proj.to_xy(lat, lon)
        cx, cy = int(x // self.cell), int(y // self.cell)
        best, best_d = None, math.inf
        rings = int(max_m // self.cell) + 1
        for r in range(rings + 1):
            for gx in range(cx - r, cx + r + 1):
                for gy in range(cy - r, cy + r + 1):
                    if max(abs(gx - cx), abs(gy - cy)) != r:
                        continue
                    for n in self.grid.get((gx, gy), ()):
                        nx, ny = self.proj.to_xy(self.g.nodes[n].lat, self.g.nodes[n].lon)
                        d = math.hypot(nx - x, ny - y)
                        if d < best_d:
                            best, best_d = n, d
            if best is not None and best_d <= r * self.cell:
                break
        return (best, best_d) if best_d <= max_m else (None, best_d)


Steps = list[tuple[int, int]]  # (edge index, from node)


def steps_length(g: Graph, steps: Steps) -> float:
    return sum(g.edges[ei].length for ei, _ in steps)


def end_node(g: Graph, start: int, steps: Steps) -> int:
    return g.edges[steps[-1][0]].other(steps[-1][1]) if steps else start


def route_between(g: Graph, costs: Costs, a: int, b: int, reuse: set[int] | frozenset = frozenset(), prev_edge: int | None = None) -> Steps | None:
    if a == b:
        return []
    dist, prev, _ = g.dijkstra(a, lambda e, n, p: costs.step(e, n, p if p is not None else (prev_edge if n == a else None), reuse))
    if b not in dist:
        return None
    return Graph.path(prev, g.edges, a, b)


def evaluate(g: Graph, start: int, steps: Steps, req: RouteRequest, costs: Costs, tempo: tuple[float, float] | None = None) -> dict:
    """Exact route metrics; tempo = (start_m, end_m) along the route."""
    total = climb = descent = unlit = lit_known = path_len = major_len = paved_match = surface_known = 0.0
    tempo_climb = 0.0
    crossings, used, hazards = [], {}, {}
    names: dict[str, float] = {}
    tempo_names: dict[str, float] = {}
    for k, (ei, frm) in enumerate(steps):
        e = g.edges[ei]
        if k > 0:
            cls, signals = g.crossing(frm, steps[k - 1][0], ei)
            if cls:
                node = g.nodes[frm]
                crossings.append(
                    {
                        "lat": round(node.lat, 6),
                        "lon": round(node.lon, 6),
                        "class": "major" if cls == 2 else "minor",
                        "signals": signals,
                        "at_m": round(total, 1),
                        # Open interval: a crossing at the tempo's first or last node happens outside the effort.
                        "in_tempo": bool(tempo and tempo[0] < total < tempo[1]),
                    }
                )
        c = e.climb_from(frm)
        climb += c
        descent += e.climb_from(e.other(frm))
        if tempo and tempo[0] <= total < tempo[1]:
            tempo_climb += c
            if e.name:
                tempo_names[e.name] = tempo_names.get(e.name, 0) + e.length
        used[ei] = used.get(ei, 0) + 1
        if e.highway in PATH_TYPES:
            path_len += e.length
        if e.road_class == 2:
            major_len += e.length
        if e.lit is not None:
            lit_known += e.length
            if not e.lit:
                unlit += e.length
        p = e.paved
        if p is not None and req.surface != "any":
            surface_known += e.length
            if p == (req.surface == "paved"):
                paved_match += e.length
        if e.name:
            names[e.name] = names.get(e.name, 0) + e.length
        if ei in costs.hazard:
            hazards[ei] = costs.hazard[ei]
        total += e.length
    repeated = sum(g.edges[ei].length * (n - 1) for ei, n in used.items() if n > 1)
    ele_known = sum(1 for ei, frm in steps if g.nodes[frm].ele is not None and g.nodes[g.edges[ei].other(frm)].ele is not None)
    t_major = sum(1 for c in crossings if c["in_tempo"] and c["class"] == "major")
    t_minor = sum(1 for c in crossings if c["in_tempo"] and c["class"] == "minor")
    return {
        "distance_m": round(total, 1),
        "climb_m": round(climb, 1),
        "descent_m": round(descent, 1),
        "crossings": crossings,
        "major_crossings": sum(c["class"] == "major" for c in crossings),
        "minor_crossings": sum(c["class"] == "minor" for c in crossings),
        "signalised_crossings": sum(c["signals"] for c in crossings),
        "tempo_major_crossings": t_major,
        "tempo_minor_crossings": t_minor,
        "tempo_climb_m": round(tempo_climb, 1),
        "tempo_names": sorted(tempo_names, key=tempo_names.get, reverse=True)[:3],
        "path_fraction": round(path_len / total, 3) if total else 0,
        "major_road_fraction": round(major_len / total, 3) if total else 0,
        "unlit_fraction": round(unlit / lit_known, 3) if lit_known else None,
        "lit_known_fraction": round(lit_known / total, 3) if total else 0,
        "surface_match_fraction": round(paved_match / surface_known, 3) if surface_known else None,
        "repeated_fraction": round(repeated / total, 3) if total else 0,
        "elevation_coverage": round(ele_known / len(steps), 3) if steps else 0,
        "hazard_edges": len(hazards),
        "hazard_weight": round(sum(hazards.values()), 3),
        "main_names": sorted(names, key=names.get, reverse=True)[:4],
        "edge_ids": [ei for ei, _ in steps],
    }


def score(m: dict, req: RouteRequest) -> tuple[float, dict]:
    parts = {
        "distance": 4.0 * abs(m["distance_m"] - req.distance_m) / req.distance_m / max(req.tolerance, 0.01),
        "crossings": 0.6 * m["major_crossings"] + 0.15 * m["minor_crossings"] + 0.3 * m["signalised_crossings"],
        "busy_roads": 1.5 * m["major_road_fraction"],
        "overlap": 1.5 * m["repeated_fraction"],
        "hazards": 3.0 * m["hazard_weight"],
    }
    km = m["distance_m"] / 1000 or 1
    if req.elevation == "flat":
        parts["climb"] = 0.05 * m["climb_m"] / km
    elif req.elevation == "hilly":
        parts["climb"] = -0.03 * min(m["climb_m"] / km, 40)
    if req.tempo_m:
        parts["tempo"] = 3.0 * m["tempo_major_crossings"] + 1.0 * m["tempo_minor_crossings"] + 0.1 * m["tempo_climb_m"] / (req.tempo_m / 1000)
    if m["surface_match_fraction"] is not None:
        parts["surface"] = 2.0 * (1 - m["surface_match_fraction"])
    if req.prefer_lit:
        parts["lighting"] = 1.5 * (m["unlit_fraction"] if m["unlit_fraction"] is not None else 0.5)
    parts = {k: round(v, 3) for k, v in parts.items()}
    return round(sum(parts.values()), 3), parts


def reasons(m: dict, req: RouteRequest, tempo: dict | None) -> list[str]:
    out = []
    err = (m["distance_m"] - req.distance_m) / req.distance_m * 100
    out.append(f"{m['distance_m'] / 1000:.2f} km ({err:+.1f}% vs requested {req.distance_m / 1000:.1f} km).")
    if tempo:
        where = " along " + ", ".join(m["tempo_names"]) if m["tempo_names"] else ""
        out.append(
            f"{tempo['distance_m'] / 1000:.2f} km tempo section{where} from km {tempo['start_m'] / 1000:.1f}: "
            f"{m['tempo_major_crossings']} major and {m['tempo_minor_crossings']} minor road crossings"
            + (f", {m['tempo_climb_m']:.0f} m climb." if m["elevation_coverage"] >= 0.9 else ".")
        )
    if m["elevation_coverage"] >= 0.9:
        out.append(f"{m['climb_m']:.0f} m total climb ({m['climb_m'] / max(m['distance_m'] / 1000, 0.1):.1f} m/km).")
    else:
        out.append("Elevation was not assessed: the network has no elevation data here, so climbing preferences could not be applied.")
    out.append(f"{m['path_fraction'] * 100:.0f}% on paths and trails; {m['major_road_fraction'] * 100:.0f}% beside major roads.")
    out.append(f"{m['major_crossings']} major / {m['minor_crossings']} minor crossings overall ({m['signalised_crossings']} signalised).")
    if m["repeated_fraction"] > 0.05:
        out.append(f"{m['repeated_fraction'] * 100:.0f}% of the distance repeats earlier sections.")
    if req.prefer_lit:
        if m["unlit_fraction"] is None:
            out.append("Lighting is not recorded in the map data for this area.")
        else:
            out.append(f"{(1 - m['unlit_fraction']) * 100:.0f}% of segments with known lighting are lit ({m['lit_known_fraction'] * 100:.0f}% of the route has lighting data).")
    if m["hazard_edges"]:
        out.append(f"Passes {m['hazard_edges']} segment(s) near reported conditions; see the conditions overlay before you go.")
    return out


def geometry(g: Graph, steps: Steps) -> list[list[float]]:
    coords: list[list[float]] = []
    for ei, frm in steps:
        pts = g.edges[ei].coords_from(frm)
        coords.extend([round(lon, 6), round(lat, 6)] for lon, lat in (pts if not coords else pts[1:]))
    return coords


def _thin(g: Graph, nodes: list[int], cell_m: float, limit: int) -> list[int]:
    if not nodes:
        return []
    proj = LocalProjection(g.nodes[nodes[0]].lat, g.nodes[nodes[0]].lon)
    seen, out = set(), []
    for n in nodes:
        x, y = proj.to_xy(g.nodes[n].lat, g.nodes[n].lon)
        key = (int(x // cell_m), int(y // cell_m))
        if key not in seen:
            seen.add(key)
            out.append(n)
            if len(out) >= limit:
                break
    return out


def tempo_segments(g: Graph, req: RouteRequest, costs: Costs, start_len: dict[int, float]) -> tuple[list[dict], float]:
    """Candidate uninterrupted segments of ~tempo length reachable within the distance budget."""
    T = req.tempo_m
    reach = max(0.0, (req.distance_m * (1 + req.tolerance) - T) / 2)

    def tempo_cost(e: Edge, frm: int, prev: int | None):
        c = e.length * (1 + costs.pen[e.id]) + (12.0 * e.climb_from(frm) if req.elevation != "hilly" else 0.0)
        if prev is not None:
            cls, signals = g.crossing(frm, prev, e.id)
            if cls == 2:
                if req.tempo_max_major == 0:
                    return None
                c += 2 * TEMPO_MINOR_LAMBDA
            elif cls == 1:
                if req.tempo_max_minor == 0:
                    return None  # exact: zero allowed means forbidden, not merely penalised
                c += TEMPO_MINOR_LAMBDA
            if signals:
                c += SIGNAL_PENALTY
        return c

    # Seeds: closeness blended with the longest incident edge, so pathway nodes (long
    # junction-free edges) are tried even when ordinary street nodes are nearer.
    def seed_rank(n: int) -> float:
        longest_edge = max((g.edges[ei].length for ei in g.adj.get(n, ())), default=0.0)
        return start_len[n] / max(reach, 1.0) - min(1.0, longest_edge / 500.0)

    seeds = sorted((n for n, d in start_len.items() if d <= reach), key=lambda n: (seed_rank(n), n))
    seeds = _thin(g, seeds, 200.0, 60)
    segments, longest = [], 0.0
    for s in seeds:
        dist, prev, length = g.dijkstra(s, tempo_cost, max_cost=T * (1 + TEMPO_TOLERANCE) * 4)
        longest = max(longest, max(length.values(), default=0.0))
        # A tempo may finish mid-edge (long junction-free pathways are single edges): node t
        # qualifies if the path reaches the minimum tempo length by t and the previous node
        # was still within the maximum. Anything past T on the last edge is cool-down.
        ends = []
        for t, l in length.items():
            if t == s or l < T * (1 - TEMPO_TOLERANCE):
                continue
            before = length[g.edges[prev[t]].other(t)]
            if before <= T * (1 + TEMPO_TOLERANCE):
                ends.append(t)
        ends.sort(key=lambda t: dist[t] / length[t])
        for t in _thin(g, ends, 300.0, 2):
            steps = Graph.path(prev, g.edges, s, t)
            if steps:
                segments.append(
                    {
                        "seed": s,
                        "end": t,
                        "steps": steps,
                        "length": length[t],
                        "tempo_length": min(length[t], T),
                        # Shortfall below the requested tempo is penalised so full-length options rank first.
                        "quality": dist[t] / length[t] + start_len[s] / max(req.distance_m, 1) + 3 * max(0.0, T - length[t]) / T,
                    }
                )
    segments.sort(key=lambda x: x["quality"])
    kept: list[dict] = []
    for seg in segments:
        ids = {ei for ei, _ in seg["steps"]}
        if all(len(ids & k["ids"]) / len(ids | k["ids"]) < 0.6 for k in kept):
            kept.append({**seg, "ids": ids})
        if len(kept) >= 12:
            break
    return kept, longest


def _extend_to(g: Graph, costs: Costs, start: int, target: int, needed: float, avoid: set[int]) -> Steps | None:
    """Warm-up start->target lengthened to ~needed metres through a via-point (ellipse method)."""
    _, prev_a, len_a = g.dijkstra(start, lambda e, n, p: costs.step(e, n, p), max_cost=needed * 3)
    _, prev_b, len_b = g.dijkstra(target, lambda e, n, p: costs.step(e, n, p), max_cost=needed * 3)
    best, best_err = None, math.inf
    for w, la in len_a.items():
        lb = len_b.get(w)
        if lb is None or w in avoid:
            continue
        err = abs(la + lb - needed)
        if err < best_err:
            best, best_err = w, err
    if best is None:
        return None
    first = Graph.path(prev_a, g.edges, start, best)
    second = Graph.path(prev_b, g.edges, target, best)
    # prev_b is a tree rooted at target; walk it back to obtain best -> target.
    back = [(ei, g.edges[ei].other(frm)) for ei, frm in reversed(second)]
    return first + back


def generate(g: Graph, req: RouteRequest) -> dict:
    if not g.adj:
        return infeasible(["No runnable network is loaded for this area."], [])
    idx = NodeIndex(g)
    start, gap = idx.nearest(req.lat, req.lon)
    if start is None:
        return infeasible(
            [f"The start point is {gap:.0f} m from the nearest mapped runnable way (limit 400 m)."],
            ["Move the start onto or next to a street or path."],
        )
    costs = Costs(g, req)
    candidates: list[dict] = []
    diag: dict = {"start_snap_m": round(gap, 1), "nodes": len(g.nodes), "edges": len(g.edges)}
    lo, hi = req.distance_m * (1 - req.tolerance), req.distance_m * (1 + req.tolerance)

    if req.tempo_m:
        _, _, start_len = g.dijkstra(start, lambda e, n, p: costs.step(e, n, p), max_cost=req.distance_m * 2)
        segs, longest = tempo_segments(g, req, costs, start_len)
        diag.update({"tempo_segments_found": len(segs), "longest_uninterrupted_m": round(longest, 1)})
        shortest_total = math.inf
        for seg in segs:
            approach = route_between(g, costs, start, seg["seed"])
            if approach is None:
                continue
            used = {ei for ei, _ in approach} | seg["ids"]
            back = route_between(g, costs, seg["end"], start, reuse=used, prev_edge=seg["steps"][-1][0])
            if back is None:
                continue
            total = steps_length(g, approach) + seg["length"] + steps_length(g, back)
            if total < lo:
                needed = req.distance_m - seg["length"] - steps_length(g, back)
                longer = _extend_to(g, costs, start, seg["seed"], needed, {n for _, n in seg["steps"]})
                if longer:
                    approach = longer
                    used = {ei for ei, _ in approach} | seg["ids"]
                    back = route_between(g, costs, seg["end"], start, reuse=used, prev_edge=seg["steps"][-1][0]) or back
                    total = steps_length(g, approach) + seg["length"] + steps_length(g, back)
            shortest_total = min(shortest_total, total)
            if not lo <= total <= hi:
                continue
            steps = approach + seg["steps"] + back
            t0 = steps_length(g, approach)
            m = evaluate(g, start, steps, req, costs, (t0, t0 + seg["tempo_length"]))
            if m["tempo_major_crossings"] > req.tempo_max_major or m["tempo_minor_crossings"] > req.tempo_max_minor:
                continue
            candidates.append({"steps": steps, "metrics": m, "tempo": {"start_m": round(t0, 1), "distance_m": round(seg["tempo_length"], 1)}})
        diag["shortest_total_m"] = None if math.isinf(shortest_total) else round(shortest_total, 1)
    elif req.shape == "out_and_back":
        _, prev, length = g.dijkstra(start, lambda e, n, p: costs.step(e, n, p), max_cost=req.distance_m * 3)
        turn = sorted((n for n, l in length.items() if abs(2 * l - req.distance_m) <= req.distance_m * req.tolerance), key=lambda n: abs(2 * length[n] - req.distance_m))
        for t in _thin(g, turn, 400.0, 8):
            out = Graph.path(prev, g.edges, start, t)
            steps = out + [(ei, g.edges[ei].other(frm)) for ei, frm in reversed(out)]
            candidates.append({"steps": steps, "metrics": evaluate(g, start, steps, req, costs), "tempo": None})
    else:
        s_node = g.nodes[start]
        for bearing in range(0, 360, 45):
            r = req.distance_m / (3 * 1.3)
            for _ in range(4):
                p1 = destination(s_node.lat, s_node.lon, bearing, r)
                p2 = destination(s_node.lat, s_node.lon, bearing + 60, r)
                w1, _ = idx.nearest(*p1, max_m=r)
                w2, _ = idx.nearest(*p2, max_m=r)
                if w1 is None or w2 is None or len({start, w1, w2}) < 3:
                    break
                a = route_between(g, costs, start, w1)
                b = route_between(g, costs, w1, w2, reuse={ei for ei, _ in a or []}, prev_edge=a[-1][0] if a else None) if a else None
                c = route_between(g, costs, w2, start, reuse={ei for ei, _ in (a or []) + (b or [])}, prev_edge=b[-1][0] if b else None) if b else None
                if a is None or b is None or c is None:
                    break
                steps = a + b + c
                total = steps_length(g, steps)
                if lo <= total <= hi:
                    candidates.append({"steps": steps, "metrics": evaluate(g, start, steps, req, costs), "tempo": None})
                    break
                r *= req.distance_m / max(total, 1.0)

    ranked = []
    for cand in candidates:
        total, parts = score(cand["metrics"], req)
        ranked.append({**cand, "score": total, "score_parts": parts})
    ranked.sort(key=lambda c: c["score"])
    unique: list[dict] = []
    for c in ranked:
        ids = set(c["metrics"]["edge_ids"])
        if all(len(ids & set(u["metrics"]["edge_ids"])) / len(ids | set(u["metrics"]["edge_ids"])) < 0.75 for u in unique):
            unique.append(c)
        if len(unique) >= req.max_results:
            break
    if not unique:
        return explain_infeasible(req, diag)
    routes = []
    for c in unique:
        m = dict(c["metrics"])
        m.pop("edge_ids")
        routes.append(
            {
                "geometry": {"type": "LineString", "coordinates": geometry(g, c["steps"])},
                "metrics": m,
                "tempo": c["tempo"],
                "score": c["score"],
                "score_parts": c["score_parts"],
                "reasons": reasons(c["metrics"], req, c["tempo"]),
            }
        )
    return {"status": "ok", "routes": routes, "diagnostics": diag}


def infeasible(reasons_: list[str], suggestions: list[str], diag: dict | None = None) -> dict:
    return {"status": "infeasible", "routes": [], "conflicts": reasons_, "suggestions": suggestions, "diagnostics": diag or {}}


def explain_infeasible(req: RouteRequest, diag: dict) -> dict:
    conflicts, suggestions = [], []
    if req.tempo_m:
        longest = diag.get("longest_uninterrupted_m", 0)
        if not diag.get("tempo_segments_found"):
            conflicts.append(
                f"No continuous {req.tempo_m / 1000:.1f} km stretch without {'major road crossings' if req.tempo_max_major == 0 else 'more crossings than allowed'} "
                f"starts within reach of your start; the longest found is {longest / 1000:.1f} km."
            )
            if longest >= 800:
                suggestions.append(f"Shorten the tempo section to {math.floor(longest / 100) / 10:.1f} km.")
            suggestions.append("Allow one signalised major crossing in the tempo section.")
            suggestions.append(f"Split the tempo into {max(2, math.ceil(req.tempo_m / max(longest, 1)))} shorter blocks.")
            suggestions.append("Start closer to a long pathway (for Calgary: the Bow or Elbow River pathways).")
        elif diag.get("shortest_total_m"):
            st = diag["shortest_total_m"]
            if st > req.distance_m * (1 + req.tolerance):
                conflicts.append(
                    f"Uninterrupted stretches exist, but reaching one and returning makes the run at least {st / 1000:.1f} km, "
                    f"longer than {req.distance_m / 1000:.1f} km +{req.tolerance * 100:.0f}%."
                )
                suggestions.append(f"Increase the distance to about {math.ceil(st / 500) * 0.5:.1f} km, or start nearer the pathway.")
            else:
                conflicts.append("Every candidate exceeded the allowed number of crossings in the tempo section once counted exactly.")
                suggestions.append("Allow more minor crossings during the tempo section.")
        else:
            conflicts.append("Tempo segments were found, but none could be connected back to the start on the mapped network.")
    else:
        conflicts.append(f"No {req.shape.replace('_', '-')} of {req.distance_m / 1000:.1f} km ±{req.tolerance * 100:.0f}% could be built from this start on the mapped network.")
        suggestions.append("Widen the distance tolerance or try an out-and-back.")
    if req.elevation == "flat" or req.surface != "any" or req.prefer_lit:
        suggestions.append("Relax surface, lighting or elevation preferences (they shape costs, not hard limits).")
    return infeasible(conflicts, suggestions, diag)

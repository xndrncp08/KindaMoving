"""Runnable network graph built from OpenStreetMap ways (ODbL).

Nodes are OSM nodes; edges are way pieces between graph nodes (way endpoints
and nodes shared by several ways). Every connection in the graph exists in the
source data: nothing is ever inferred between disconnected ways.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

from ..geo import segment_m

# Classes a runner may traverse, with a base cost multiplier (preference, not prohibition).
TRAVERSABLE = {
    "footway": 0.0, "path": 0.0, "cycleway": 0.05, "pedestrian": 0.0, "track": 0.15, "living_street": 0.1,
    "residential": 0.2, "service": 0.3, "unclassified": 0.3, "tertiary": 0.6, "tertiary_link": 0.6,
    "secondary": 0.9, "secondary_link": 0.9, "primary": 1.2, "primary_link": 1.2, "steps": 2.0,
}
# Road class for crossing analysis: 2 = major (traffic arterial), 1 = minor street, 0 = none.
ROAD_CLASS = {
    "trunk": 2, "trunk_link": 2, "primary": 2, "primary_link": 2, "secondary": 2, "secondary_link": 2,
    "tertiary": 2, "tertiary_link": 2, "residential": 1, "unclassified": 1, "living_street": 1, "service": 1,
}
PAVED = {"asphalt", "concrete", "paved", "paving_stones", "concrete:plates", "sett", "chipseal"}
UNPAVED = {"gravel", "fine_gravel", "compacted", "dirt", "earth", "ground", "grass", "unpaved", "wood", "mud", "sand"}


@dataclass
class Node:
    lat: float
    lon: float
    ele: float | None = None
    crossing: str | None = None  # OSM crossing=* (traffic_signals, marked, uncontrolled, ...)
    signals: bool = False


@dataclass
class Edge:
    id: int
    u: int
    v: int
    length: float
    highway: str
    coords: list[tuple[float, float]]  # (lon, lat) from u to v
    way_id: int = 0
    name: str | None = None
    surface: str | None = None
    lit: bool | None = None
    traversable: bool = True
    road_class: int = 0
    climb_uv: float = 0.0
    climb_vu: float = 0.0

    def other(self, n: int) -> int:
        return self.v if n == self.u else self.u

    def climb_from(self, n: int) -> float:
        return self.climb_uv if n == self.u else self.climb_vu

    def coords_from(self, n: int) -> list[tuple[float, float]]:
        return self.coords if n == self.u else self.coords[::-1]

    @property
    def paved(self) -> bool | None:
        if self.surface in PAVED:
            return True
        if self.surface in UNPAVED:
            return False
        if self.highway in ("residential", "service", "unclassified", "tertiary", "secondary", "primary", "living_street"):
            return True  # untagged urban roads are paved in practice
        return None


@dataclass
class Graph:
    nodes: dict[int, Node] = field(default_factory=dict)
    edges: list[Edge] = field(default_factory=list)
    adj: dict[int, list[int]] = field(default_factory=dict)  # node -> traversable edge indices
    roads_at: dict[int, list[int]] = field(default_factory=dict)  # node -> road edge indices (any class > 0)

    def add_edge(self, e: Edge) -> None:
        e.id = len(self.edges)
        self.edges.append(e)
        for n in (e.u, e.v):
            if e.traversable:
                self.adj.setdefault(n, []).append(e.id)
            if e.road_class:
                self.roads_at.setdefault(n, []).append(e.id)

    def crossing(self, v: int, e_in: int | None, e_out: int | None) -> tuple[int, bool]:
        """Road class crossed when passing ``v`` from ``e_in`` to ``e_out``, and whether it is signalised.

        Without sidewalk sides in the data, every other road meeting at ``v``
        counts as a potential crossing (conservative: a right turn that crosses
        nothing is still counted). Exceptions: a turnaround crosses nothing, and
        going straight along one way does not cross that same way.
        """
        if e_in is not None and e_in == e_out:
            return 0, False
        travelled = {e for e in (e_in, e_out) if e is not None}
        same_way = (
            self.edges[e_in].way_id
            if e_in is not None and e_out is not None and self.edges[e_in].way_id == self.edges[e_out].way_id
            else None
        )
        cls = 0
        for r in self.roads_at.get(v, ()):
            if r in travelled or (same_way is not None and self.edges[r].way_id == same_way):
                continue
            cls = max(cls, self.edges[r].road_class)
        node = self.nodes[v]
        return cls, cls > 0 and (node.signals or node.crossing == "traffic_signals")

    def nearest_node(self, lat: float, lon: float, max_m: float = 300.0) -> tuple[int | None, float]:
        best, best_d = None, math.inf
        for n in self.adj:
            nd = self.nodes[n]
            d = segment_m(lat, lon, nd.lat, nd.lon)
            if d < best_d:
                best, best_d = n, d
        return (best, best_d) if best_d <= max_m else (None, best_d)

    def dijkstra(self, source: int, cost, max_cost: float = math.inf, blocked=None) -> tuple[dict[int, float], dict[int, int], dict[int, float]]:
        """Single-source search. ``cost(edge, from_node, prev_edge)`` -> float or None (forbidden).

        Returns (cost to node, predecessor edge, path length to node).
        """
        dist = {source: 0.0}
        length = {source: 0.0}
        prev: dict[int, int] = {}
        heap = [(0.0, source)]
        while heap:
            d, n = heapq.heappop(heap)
            if d > dist.get(n, math.inf) or d > max_cost:
                continue
            for ei in self.adj.get(n, ()):
                e = self.edges[ei]
                m = e.other(n)
                if blocked and blocked(m, ei, prev.get(n)):
                    continue
                c = cost(e, n, prev.get(n))
                if c is None:
                    continue
                nd = d + c
                if nd < dist.get(m, math.inf):
                    dist[m], prev[m], length[m] = nd, ei, length[n] + e.length
                    heapq.heappush(heap, (nd, m))
        return dist, prev, length

    @staticmethod
    def path(prev: dict[int, int], edges: list[Edge], source: int, target: int) -> list[tuple[int, int]]:
        """Edge sequence as (edge index, from node) from ``source`` to ``target`` using a predecessor map."""
        out, n = [], target
        while n != source:
            ei = prev.get(n)
            if ei is None:
                return []
            e = edges[ei]
            m = e.other(n)
            out.append((ei, m))
            n = m
        return out[::-1]


def build(osm_elements: list[dict], elevations: dict[int, float] | None = None) -> Graph:
    """Graph from Overpass JSON elements (ways with tags, nodes with coordinates/tags)."""
    nodes = {e["id"]: e for e in osm_elements if e.get("type") == "node"}
    ways = [e for e in osm_elements if e.get("type") == "way" and "highway" in e.get("tags", {})]
    usable = []
    for w in ways:
        t = w["tags"]
        hw = t["highway"]
        foot = t.get("foot")
        access = t.get("access")
        traversable = hw in TRAVERSABLE and foot != "no" and (access not in ("private", "no") or foot in ("yes", "designated"))
        cls = ROAD_CLASS.get(hw, 0)
        if hw == "service" and t.get("service") in ("driveway", "parking_aisle", "drive-through"):
            cls = 0  # crossing a driveway is not a street crossing
        if (traversable or cls) and all(n in nodes for n in w["nodes"]):
            usable.append((w, traversable, cls))
    uses: dict[int, int] = {}
    for w, _, _ in usable:
        for n in w["nodes"]:
            uses[n] = uses.get(n, 0) + 1
    g = Graph()
    for nid in uses:
        tags = nodes[nid].get("tags", {})
        g.nodes[nid] = Node(
            lat=nodes[nid]["lat"],
            lon=nodes[nid]["lon"],
            ele=(elevations or {}).get(nid),
            crossing=tags.get("crossing"),
            signals=tags.get("highway") == "traffic_signals" or tags.get("crossing") == "traffic_signals",
        )
    for w, traversable, cls in usable:
        t = w["tags"]
        ids = w["nodes"]
        start = 0
        for i in range(1, len(ids)):
            if i == len(ids) - 1 or uses[ids[i]] > 1:
                piece = ids[start : i + 1]
                coords = [(nodes[n]["lon"], nodes[n]["lat"]) for n in piece]
                length = sum(segment_m(a[1], a[0], b[1], b[0]) for a, b in zip(coords, coords[1:]))
                if length > 0:
                    u, v = piece[0], piece[-1]
                    eu, ev = g.nodes[u].ele, g.nodes[v].ele
                    g.add_edge(
                        Edge(
                            id=0, u=u, v=v, length=length, highway=t["highway"], coords=coords, way_id=w["id"],
                            name=t.get("name"), surface=t.get("surface"),
                            lit={"yes": True, "no": False}.get(t.get("lit")), traversable=traversable, road_class=cls,
                            climb_uv=max(0.0, ev - eu) if eu is not None and ev is not None else 0.0,
                            climb_vu=max(0.0, eu - ev) if eu is not None and ev is not None else 0.0,
                        )
                    )
                start = i
    return g

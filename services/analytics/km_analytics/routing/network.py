"""PostGIS persistence for the runnable network.

Loading uses the GiST index on network_edges.geom (bounding-box && test), and
results are cached per ~2 km tile and radius bucket, so repeated requests near
the same start reuse one in-memory graph.
"""

from __future__ import annotations

import json
import math
import os
import threading
from collections import OrderedDict

from .graph import Edge, Graph, Node

_cache: OrderedDict[tuple, Graph] = OrderedDict()
_lock = threading.Lock()
CACHE_SIZE = 6


def database_url() -> str | None:
    return os.environ.get("NETWORK_DATABASE_URL")


def load(lat: float, lon: float, radius_m: float, dsn: str | None = None) -> Graph:
    import psycopg

    dsn = dsn or database_url()
    if not dsn:
        raise RuntimeError("NETWORK_DATABASE_URL is not configured")
    radius_m = min(max(radius_m, 1000.0), 15000.0)
    key = (round(lat / 0.02), round(lon / 0.03), int(radius_m // 2500 + 1))
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    # Load around the tile centre with the bucketed radius so cache hits cover the request.
    clat, clon, r = key[0] * 0.02, key[1] * 0.03, key[2] * 2500 + 2500
    dlat = r / 111320
    dlon = r / (111320 * max(0.2, math.cos(math.radians(clat))))
    g = Graph()
    with psycopg.connect(dsn, connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute("set statement_timeout = '20s'")
        cur.execute(
            """
            select e.source, e.target, e.osm_way_id, extensions.st_asgeojson(e.geom), e.length_m, e.highway, e.name, e.surface, e.lit,
                   e.traversable, e.road_class, e.climb_fwd, e.climb_back
            from public.network_edges e
            where e.geom operator(extensions.&&) extensions.st_makeenvelope(%s, %s, %s, %s, 4326)
            """,
            (clon - dlon, clat - dlat, clon + dlon, clat + dlat),
        )
        rows = cur.fetchall()
        ids = {r[0] for r in rows} | {r[1] for r in rows}
        if ids:
            cur.execute(
                "select id, extensions.st_y(geom), extensions.st_x(geom), ele, crossing, signals from public.network_nodes where id = any(%s)",
                (list(ids),),
            )
            for nid, nlat, nlon, ele, crossing, signals in cur.fetchall():
                g.nodes[nid] = Node(nlat, nlon, ele, crossing, signals)
    for u, v, way, geo, length, hw, name, surface, lit, trav, cls, up, down in rows:
        g.add_edge(
            Edge(id=0, u=u, v=v, length=length, highway=hw, coords=[tuple(c) for c in json.loads(geo)["coordinates"]], way_id=way,
                 name=name, surface=surface, lit=lit, traversable=trav, road_class=cls, climb_uv=up, climb_vu=down)
        )
    with _lock:
        _cache[key] = g
        while len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return g


def store(g: Graph, region: str, bbox: tuple[float, float, float, float], dsn: str, elevation_source: str | None, *, replace_existing: bool = False) -> dict:
    """Store a validated region atomically; replacement requires explicit caller opt-in."""
    import psycopg

    if not g.edges or not g.nodes or any(not math.isfinite(e.length) or e.length<=0 for e in g.edges):
        raise ValueError("Refusing an empty or invalid network")
    used = {e.u for e in g.edges} | {e.v for e in g.edges}
    with psycopg.connect(dsn, connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute("set local statement_timeout = '120s'")
        cur.execute("set local lock_timeout = '5s'")
        cur.execute("select pg_advisory_xact_lock(7348912)")
        cur.execute("select exists(select 1 from public.network_edges where region=%s)", (region,))
        if cur.fetchone()[0] and not replace_existing:
            raise ValueError("Region exists; explicit replacement approval is required")
        cur.execute("select exists(select 1 from public.network_nodes where id=any(%s) and region<>%s)", (list(used),region))
        if cur.fetchone()[0]:
            raise ValueError("Nodes overlap another region; refusing to overwrite it")
        cur.execute("delete from public.network_edges where region = %s", (region,))
        cur.execute("delete from public.network_nodes where region = %s and id <> all(%s)", (region, list(used)))
        cur.executemany(
            """insert into public.network_nodes (id, region, geom, ele, crossing, signals)
               values (%s, %s, extensions.st_setsrid(extensions.st_makepoint(%s, %s), 4326), %s, %s, %s)
               on conflict (id) do update set region = excluded.region, geom = excluded.geom, ele = excluded.ele,
                 crossing = excluded.crossing, signals = excluded.signals""",
            [(n, region, g.nodes[n].lon, g.nodes[n].lat, g.nodes[n].ele, g.nodes[n].crossing, g.nodes[n].signals) for n in used],
        )
        cur.executemany(
            """insert into public.network_edges (region, source, target, osm_way_id, geom, length_m, highway, name, surface, lit,
                 traversable, road_class, climb_fwd, climb_back)
               values (%s, %s, %s, %s, extensions.st_setsrid(extensions.st_geomfromgeojson(%s), 4326), %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [
                (region, e.u, e.v, e.way_id, json.dumps({"type": "LineString", "coordinates": e.coords}), e.length, e.highway, e.name,
                 e.surface, e.lit, e.traversable, e.road_class, e.climb_uv, e.climb_vu)
                for e in g.edges
            ],
        )
        w, s, e_, n = bbox
        cur.execute(
            """insert into public.network_imports (region, bbox, source, license, nodes, edges, elevation_source)
               values (%s, extensions.st_makeenvelope(%s, %s, %s, %s, 4326), 'OpenStreetMap via Overpass API',
                       'ODbL 1.0, (c) OpenStreetMap contributors', %s, %s, %s)""",
            (region, w, s, e_, n, len(used), len(g.edges), elevation_source),
        )
    with _lock:
        _cache.clear()
    return {"nodes": len(used), "edges": len(g.edges)}

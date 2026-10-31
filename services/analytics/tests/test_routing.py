"""Routing on a synthetic, deterministic city.

21x21 grid, 150 m spacing (3 km square). Rows/columns are residential except
row 10 (secondary) and column 10 (primary). A riverside footway runs 100 m south
of row 0 from column 0 to column 20 and touches the grid only at its two ends,
so it is the only crossing-free stretch longer than 150 m.
"""

import math

import pytest

from km_analytics.geo import LocalProjection, segment_m
from km_analytics.routing.engine import Hazard, RouteRequest, generate
from km_analytics.routing.graph import build

ORIGIN = (51.03, -114.10)
N, STEP = 21, 150.0
proj = LocalProjection(*ORIGIN)


def city(with_river=True, island=False):
    els, nid, wid = [], {}, [1000]

    def node(key, x, y, tags=None):
        if key not in nid:
            lat, lon = proj.to_latlon(x, y)
            nid[key] = 1 + len(nid)
            els.append({"type": "node", "id": nid[key], "lat": lat, "lon": lon, **({"tags": tags} if tags else {})})
        return nid[key]

    def way(keys, tags):
        wid[0] += 1
        els.append({"type": "way", "id": wid[0], "nodes": [nid[k] for k in keys], "tags": tags})

    for i in range(N):
        for j in range(N):
            node((i, j), i * STEP, j * STEP)
    for j in range(N):  # rows (east-west)
        hw = "secondary" if j == 10 else "residential"
        way([(i, j) for i in range(N)], {"highway": hw, "name": f"Row {j}"})
    for i in range(N):  # columns (north-south)
        hw = "primary" if i == 10 else "residential"
        way([(i, j) for j in range(N)], {"highway": hw, "name": f"Col {i}"})
    if with_river:
        for k in range(61):
            node(("r", k), k * 50.0, -100.0)
        way([(0, 0)] + [("r", k) for k in range(61)] + [(20, 0)], {"highway": "footway", "name": "River Path", "surface": "asphalt", "lit": "yes"})
    if island:
        node("i1", 5000, 5000)
        node("i2", 5100, 5000)
        way(["i1", "i2"], {"highway": "footway"})
    return build(els)


@pytest.fixture(scope="module")
def g():
    return city()


def at(i, j):
    return proj.to_latlon(i * STEP + 3, j * STEP + 3)


def assert_on_network(g, coords):
    """Every consecutive coordinate pair must lie on one mapped edge: no invented connections."""
    pairs = set()
    for e in g.edges:
        for a, b in zip(e.coords, e.coords[1:]):
            pairs.add((round(a[0], 6), round(a[1], 6), round(b[0], 6), round(b[1], 6)))
            pairs.add((round(b[0], 6), round(b[1], 6), round(a[0], 6), round(a[1], 6)))
    for a, b in zip(coords, coords[1:]):
        assert (a[0], a[1], b[0], b[1]) in pairs, f"segment {a}->{b} is not on the network"


def test_crossing_semantics(g):
    # Node (5,10): residential column 5 meets secondary row 10.
    n = next(k for k, v in g.nodes.items() if segment_m(v.lat, v.lon, *proj.to_latlon(5 * STEP, 10 * STEP)) < 1)
    col = [e.id for e in g.edges if n in (e.u, e.v) and e.name == "Col 5"]
    row = [e.id for e in g.edges if n in (e.u, e.v) and e.name == "Row 10"]
    assert g.crossing(n, col[0], col[1])[0] == 2  # crossing the secondary road
    assert g.crossing(n, row[0], row[1])[0] == 1  # along the secondary, crossing a residential street
    assert g.crossing(n, row[0], col[0])[0] == 2  # turning: conservatively counts the road continuing ahead
    assert g.crossing(n, col[0], col[0]) == (0, False)  # a turnaround crosses nothing


def test_loop_within_tolerance_and_on_network(g):
    out = generate(g, RouteRequest(*at(5, 5), distance_m=5000, tolerance=0.1))
    assert out["status"] == "ok" and out["routes"]
    for r in out["routes"]:
        coords = r["geometry"]["coordinates"]
        assert 4500 <= r["metrics"]["distance_m"] <= 5500
        assert coords[0] == coords[-1], "a loop returns to its start"
        assert_on_network(g, coords)
        assert r["reasons"] and r["score_parts"]


def test_tempo_uses_uninterrupted_river_path(g):
    req = RouteRequest(*at(2, 1), distance_m=7000, tolerance=0.12, tempo_m=2500, tempo_max_major=0, tempo_max_minor=0, elevation="flat")
    out = generate(g, req)
    assert out["status"] == "ok", out
    best = out["routes"][0]
    assert best["metrics"]["tempo_major_crossings"] == 0 and best["metrics"]["tempo_minor_crossings"] == 0
    assert best["metrics"]["tempo_names"] == ["River Path"]
    assert abs(best["tempo"]["distance_m"] - 2500) <= 250
    assert_on_network(g, best["geometry"]["coordinates"])
    assert any("tempo section along River Path" in s for s in best["reasons"])


def test_impossible_tempo_explains_conflict(g):
    out = generate(g, RouteRequest(*at(5, 5), distance_m=10000, tempo_m=6000, tempo_max_major=0, tempo_max_minor=0))
    assert out["status"] == "infeasible" and out["routes"] == []
    assert "longest found is 3.1 km" in out["conflicts"][0] or "longest found is 3.2 km" in out["conflicts"][0]
    assert any("Shorten the tempo section" in s for s in out["suggestions"])


def test_tempo_too_far_for_distance(g):
    # The river is reachable but the run would be far longer than 3 km.
    out = generate(g, RouteRequest(*at(15, 18), distance_m=3000, tolerance=0.05, tempo_m=1500, tempo_max_minor=0))
    assert out["status"] == "infeasible"
    assert out["conflicts"]


def test_no_fabricated_connection_from_island():
    g = city(island=True)
    lat, lon = proj.to_latlon(5000, 5000)
    out = generate(g, RouteRequest(lat, lon, distance_m=3000))
    assert out["status"] == "infeasible"


def test_start_far_from_network(g):
    lat, lon = proj.to_latlon(-3000, -3000)
    out = generate(g, RouteRequest(lat, lon, distance_m=5000))
    assert out["status"] == "infeasible" and "nearest mapped runnable way" in out["conflicts"][0]


def test_hazard_on_river_is_avoided_or_reported(g):
    hz = Hazard(*proj.to_latlon(1500, -100), radius_m=60, weight=0.9, kind="ice")
    req = RouteRequest(*at(2, 1), distance_m=7000, tolerance=0.12, tempo_m=2500, tempo_max_minor=0, hazards=[hz])
    out = generate(g, req)
    if out["status"] == "ok":
        best = out["routes"][0]
        assert best["metrics"]["hazard_edges"] >= 1 and best["score_parts"]["hazards"] > 0
        assert any("reported conditions" in r for r in best["reasons"])


def test_out_and_back_repeats_itself(g):
    out = generate(g, RouteRequest(*at(5, 5), distance_m=4000, shape="out_and_back"))
    r = out["routes"][0]
    coords = r["geometry"]["coordinates"]
    assert coords == coords[::-1]
    assert r["metrics"]["repeated_fraction"] == pytest.approx(0.5, abs=0.01)  # the return half repeats


def test_generation_is_deterministic(g):
    req = RouteRequest(*at(5, 5), distance_m=5000)
    assert generate(g, req) == generate(g, req)

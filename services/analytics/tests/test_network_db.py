"""PostGIS round trip on real Calgary data (OpenStreetMap, ODbL; elevations: Copernicus GLO-90).

Runs only inside the disposable database harness:
    python3 scripts/test-database.py --then "services/analytics/.venv/bin/python -m pytest -q services/analytics/tests/test_network_db.py"
"""

import gzip
import json
import os
from pathlib import Path

import pytest

from km_analytics.routing import graph as G
from km_analytics.routing import network
from km_analytics.routing.engine import RouteRequest, generate
from km_analytics.routing.validate import route_waypoints, validate

DSN = os.environ.get("KM_TEST_DATABASE_URL")
FIXTURE = Path(__file__).parent / "data" / "calgary_eau_claire.json.gz"
pytestmark = pytest.mark.skipif(not DSN or not FIXTURE.exists(), reason="needs the disposable PostGIS harness")
START = (51.0532, -114.0727)  # Eau Claire Plaza, beside the Bow River pathway


@pytest.fixture(scope="module")
def loaded():
    data = json.load(gzip.open(FIXTURE, "rt"))
    g = G.build(data["elements"], {int(k): v for k, v in data["elevations"].items() if v is not None})
    w, s, e, n = data["bbox"]
    counts = network.store(g, "calgary-test", (w, s, e, n), DSN, data["elevation_source"])
    return g, counts, network.load(*START, 2500, DSN)


def test_store_and_indexed_load_round_trip(loaded):
    g, counts, db_graph = loaded
    assert counts["edges"] == len(g.edges) > 1000
    assert len(db_graph.edges) == len(g.edges), "the bbox query must return the whole imported region"
    assert sum(e.length for e in db_graph.edges) == pytest.approx(sum(e.length for e in g.edges), rel=1e-4)
    assert any(n.ele is not None for n in db_graph.nodes.values())
    import psycopg
    with psycopg.connect(DSN) as conn:
        for table in ('network_nodes', 'network_edges'):
            assert conn.execute(f"select count(*) from public.{table} where region='calgary-test' and not extensions.st_isvalid(geom)").fetchone()[0] == 0
            index = conn.execute("select indexdef from pg_indexes where schemaname='public' and indexname=%s", (table + '_geom',)).fetchone()
            assert index and 'USING gist (geom)' in index[0]
        crossings, signals = conn.execute("select count(*) filter(where crossing is not null), count(*) filter(where signals) from public.network_nodes where region='calgary-test'").fetchone()
        used = {e.u for e in g.edges} | {e.v for e in g.edges}
        assert crossings == sum(g.nodes[n].crossing is not None for n in used)
        assert signals == sum(g.nodes[n].signals for n in used)


def test_real_tempo_route_on_bow_river(loaded):
    _, _, g = loaded
    out = generate(g, RouteRequest(*START, distance_m=6000, tolerance=0.12, tempo_m=2000, tempo_max_major=0, tempo_max_minor=0, elevation="flat"))
    assert out["status"] == "ok", out
    best = out["routes"][0]
    assert best["metrics"]["tempo_major_crossings"] == 0 and best["metrics"]["tempo_minor_crossings"] == 0
    assert any("Bow River" in name or "Prince" in name or "Eau Claire" in name for name in best["metrics"]["tempo_names"]), best["metrics"]["tempo_names"]
    assert best["metrics"]["elevation_coverage"] >= 0.9, "elevations were imported, so climb must be assessed"
    check = validate(g, best["geometry"]["coordinates"])
    assert check["valid"] and check["network_coverage"] == 1.0 and check["is_loop"]


def test_validation_flags_invented_connection(loaded):
    _, _, g = loaded
    # Straight across the Bow River between the Louise and Peace bridges (open water).
    report = validate(g, [[-114.0830, 51.0560], [-114.0830, 51.0510]])
    assert not report["valid"]
    assert {i["kind"] for i in report["issues"]} >= {"jump", "off_network"}


def test_waypoint_editing_snaps_to_network(loaded):
    _, _, g = loaded
    out = route_waypoints(g, [{"lat": 51.0532, "lon": -114.0727}, {"lat": 51.0540, "lon": -114.0650}, {"lat": 51.0532, "lon": -114.0727}], RouteRequest(*START, distance_m=1000))
    assert out["status"] == "ok"
    assert validate(g, out["geometry"]["coordinates"])["network_coverage"] == 1.0


def test_replacement_requires_opt_in_and_keeps_original(loaded):
    g, counts, _ = loaded
    with pytest.raises(ValueError, match="Region exists"):
        network.store(g, "calgary-test", (-114.13,51.035,-114.03,51.070), DSN, None)
    import psycopg
    with psycopg.connect(DSN) as conn:
        assert conn.execute("select count(*) from network_edges where region='calgary-test'").fetchone()[0] == counts['edges']


def test_explicit_replacement_and_cross_region_protection(loaded):
    g, counts, _ = loaded
    assert network.store(g, 'calgary-test', (-114.13,51.035,-114.03,51.070), DSN, None, replace_existing=True)['edges']==counts['edges']
    with pytest.raises(ValueError,match='overlap'):
        network.store(g, 'another-region', (-114.13,51.035,-114.03,51.070), DSN, None)


def test_readiness_rejects_an_administrative_connection(loaded,monkeypatch):
    from km_analytics.deployment import network_ready
    monkeypatch.setenv('NETWORK_DATABASE_URL',DSN)
    assert network_ready() is False


def test_cache_never_reuses_a_graph_for_different_connection_credentials(loaded, monkeypatch):
    import psycopg
    # loaded() warmed the coordinate tile. A different connection must be checked.
    def denied(*args, **kwargs):
        raise psycopg.OperationalError('synthetic unavailable connection')
    monkeypatch.setattr(psycopg, 'connect', denied)
    with pytest.raises(psycopg.OperationalError):
        network.load(*START, 2500, DSN + ' application_name=isolated-cache-test')


def test_readiness_accepts_reader_and_rejects_truncate_even_with_rls(loaded, monkeypatch):
    import psycopg
    from contextlib import contextmanager
    from km_analytics.deployment import network_ready
    original = psycopg.connect
    with original(DSN) as conn:
        conn.execute("update public.network_edges set region='calgary' where region='calgary-test'")
        @contextmanager
        def reader_connection(*args, **kwargs):
            yield conn
        monkeypatch.setattr(psycopg, 'connect', reader_connection)
        monkeypatch.setenv('NETWORK_DATABASE_URL', DSN)
        conn.execute('set role km_network_reader')
        assert network_ready() is True
        conn.execute('reset role')
        conn.execute('grant truncate on public.network_edges to km_network_reader')
        conn.execute('set role km_network_reader')
        assert network_ready() is False
        conn.execute('reset role')
        conn.rollback()  # Only this disposable transaction was changed.

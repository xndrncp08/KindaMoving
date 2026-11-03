from datetime import datetime, timezone
import io
import json
import importlib.util
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from km_analytics.deployment import configuration_errors
from km_analytics.timezones import zone_at
from km_analytics.api import app


def test_production_validation_is_safe():
    good={"ANALYTICS_SERVICE_TOKEN":"a"*32,"NETWORK_DATABASE_URL":"postgresql://km_network_reader:secret@db.test/postgres?sslmode=verify-full"}
    assert configuration_errors(good)==[]
    errors=configuration_errors({**good,"NETWORK_DATABASE_URL":"postgresql://postgres:secret@db.test/postgres"})
    assert errors and "secret" not in str(errors)


def test_startup_fails_closed(monkeypatch):
    monkeypatch.setenv("KM_DEPLOYMENT","production")
    monkeypatch.delenv("ANALYTICS_SERVICE_TOKEN",raising=False)
    with pytest.raises(RuntimeError,match="Invalid deployment"):
        with TestClient(app):
            pass


def test_ready_dependency_failures_are_not_leaked(monkeypatch):
    from km_analytics import api, deployment
    monkeypatch.setattr(deployment,"configuration_errors",lambda:[])
    def unavailable():
        raise RuntimeError("postgresql://secret")
    monkeypatch.setattr(deployment,"network_ready",unavailable)
    api._readiness["at"]=0
    with TestClient(app) as client:
        response=client.get('/readyz')
        assert response.status_code==503 and response.json()=={"ok":False}
        assert client.get('/healthz').status_code==200
        assert client.get('/openapi.json').status_code==404
    api._readiness["at"]=0


@pytest.mark.parametrize("instant,hours",[("2026-11-01T09:00:00",-6),("2027-01-15T09:00:00",-6),("2025-01-15T09:00:00",-7),("2025-07-15T09:00:00",-6)])
def test_alberta_offsets_and_historical_dst(instant,hours):
    dt=datetime.fromisoformat(instant).replace(tzinfo=timezone.utc)
    assert dt.astimezone(zone_at('America/Edmonton',dt.timestamp())).utcoffset().total_seconds()==hours*3600


spec=importlib.util.spec_from_file_location('network_import',Path(__file__).parents[1]/'scripts/import_network.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.mark.parametrize('bbox',['nan,51,-114,52','-120,0,-110,60','-114.3,50.8,-113.8,51.3','-114,51,-115,52'])
def test_bad_bbox_never_reaches_a_database(bbox):
    with pytest.raises(ValueError): module.validated_bbox(bbox)


def test_import_admission_is_bounded():
    assert module.validated_bbox('-114.13,51.035,-114.03,51.070')
    with pytest.raises(ValueError): module.read_document(io.BytesIO(b'{"elements":[]}'))
    with pytest.raises(ValueError): module.read_document(io.BytesIO(json.dumps({'elements':[{'type':'node','lat':0,'lon':0}]}).encode()))


def test_explicit_device_offsets_are_not_rewritten():
    from km_analytics.clean import _offset
    from km_analytics.model import ParsedActivity
    activity=ParsedActivity(format='fit',utc_offset_s=-25200)
    assert _offset(activity,1793650000,'America/Edmonton') == (-25200,False)


def test_smoke_origin_rejects_credential_and_redirect_targets():
    spec=importlib.util.spec_from_file_location('smoke',Path(__file__).parents[3]/'scripts/smoke-production.py')
    smoke=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(smoke)
    assert smoke.origin('https://app.test')=='https://app.test'
    for value in ('http://app.test','https://user:secret@app.test','https://app.test/?token=secret','https://app.test/path'):
        with pytest.raises(ValueError): smoke.origin(value)
    assert smoke.NoRedirect().redirect_request(None,None,302,'',{},'https://elsewhere.test') is None


def test_ready_success_is_cached(monkeypatch):
    from km_analytics import api, deployment
    monkeypatch.setattr(deployment,'configuration_errors',lambda:[])
    calls=[]
    monkeypatch.setattr(deployment,'network_ready',lambda:calls.append(True) or True)
    api._readiness['at']=0
    with TestClient(app) as client:
        assert client.get('/readyz').status_code==200
        assert client.get('/readyz').status_code==200
    assert len(calls)==1
    api._readiness['at']=0


def test_import_cli_dry_run_does_not_use_writer_credentials(tmp_path):
    import gzip
    import subprocess
    import sys
    import os
    source=Path(__file__).parent/'data/calgary_eau_claire.json.gz'
    document=json.loads(gzip.decompress(source.read_bytes()))
    extract=tmp_path/'calgary.json'
    extract.write_text(json.dumps({'elements':document['elements']}))
    result=subprocess.run([sys.executable,str(Path(module.__file__)),'--region','calgary','--bbox=-114.13,51.035,-114.03,51.070','--from-file',str(extract)],env={**os.environ,'NETWORK_ADMIN_DATABASE_URL':'invalid-must-never-be-used'},capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    assert json.loads(result.stdout)['apply'] is False


def test_dry_run_reports_disconnected_and_invalid_topology():
    from km_analytics.routing.graph import Graph, Node, Edge
    graph = Graph(nodes={1: Node(51, -114), 2: Node(51.01, -114),
                         3: Node(51, -114.01), 4: Node(51.01, -114.01)})
    for index, (u, v) in enumerate([(1, 2), (3, 4)]):
        graph.add_edge(Edge(id=index, u=u, v=v, way_id=index,
                            coords=[[-114, 51], [-114, 51.01]], length=100, highway='path'))
    report = module.topology(graph)
    assert report['components'] == 2 and report['largest_component_nodes'] == 2
    assert report['stored_nodes'] == 4 and report['elevation_coverage'] == 0
    graph.edges[0].length = -1
    with pytest.raises(ValueError):
        module.topology(graph)
    graph.edges[0].length = 100
    graph.edges[0].v = 99
    with pytest.raises(ValueError):
        module.topology(graph)


def test_staging_requires_a_separate_matching_reader_project():
    ref = 'abcdefghijklmnopqrst'
    good = {'KM_DEPLOYMENT': 'staging', 'KM_STAGING_SUPABASE_REF': ref,
            'ANALYTICS_SERVICE_TOKEN': 'a'*32,
            'NETWORK_DATABASE_URL': f'postgresql://km_network_reader.xxxxxxxxxxxxxxxxxxxx:secret@aws-0.ca-central-1.pooler.supabase.com/postgres?sslmode=verify-full'}
    assert configuration_errors(good)
    good['NETWORK_DATABASE_URL'] = f'postgresql://km_network_reader.{ref}:secret@aws-0.ca-central-1.pooler.supabase.com/postgres?sslmode=verify-full'
    assert not configuration_errors(good)
    assert configuration_errors({**good, 'KM_STAGING_SUPABASE_REF': 'yqzbsuandpdlvgtgnwln'})


def test_preview_helper_rejects_production_overrides_and_shared_ref():
    import subprocess, os
    script = Path(__file__).parents[3] / 'scripts/deploy-staging.sh'
    for args, ref in [(['--prod'], 'abcdefghijklmnopqrst'), ([], 'yqzbsuandpdlvgtgnwln'), ([], '')]:
        result = subprocess.run(['bash', str(script), *args], env={**os.environ, 'KM_STAGING_SUPABASE_REF': ref}, capture_output=True)
        assert result.returncode != 0


def test_slow_readiness_has_an_http_deadline_and_does_not_spawn_more_probes(monkeypatch):
    import threading, time
    from km_analytics import api, deployment
    release = threading.Event()
    calls = []
    def slow():
        calls.append(True)
        release.wait(2)
        return True
    monkeypatch.setattr(deployment, 'configuration_errors', lambda: [])
    monkeypatch.setattr(deployment, 'network_ready', slow)
    monkeypatch.setattr(api, 'READINESS_TIMEOUT_S', .05)
    api._readiness.update(at=0, ok=False, task=None)
    with TestClient(app) as client:
        try:
            started = time.monotonic()
            assert client.get('/readyz').status_code == 503
            assert time.monotonic() - started < .5
            assert client.get('/healthz').status_code == 200
            api._readiness['at'] = 0
            assert client.get('/readyz').status_code == 503
            assert len(calls) == 1
        finally:
            release.set()
    api._readiness.update(at=0, ok=False, task=None)


def test_staging_preflight_and_route_acceptance_reject_wrong_targets():
    def load(name):
        spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[3]/'scripts'/f'{name}.py')
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        return mod
    preflight = load('validate-staging')
    assert preflight.validate({})
    ref = 'abcdefghijklmnopqrst'
    env = {'KM_STAGING_SUPABASE_REF': ref, 'NEXT_PUBLIC_SUPABASE_URL': f'https://{ref}.supabase.co',
           'NETWORK_DATABASE_URL': f'postgresql://km_network_reader:secret@db.{ref}.supabase.co/postgres?sslmode=verify-full',
           'ANALYTICS_SERVICE_TOKEN': 'a'*32, 'CRON_SECRET': 'b'*32,
           'NEXT_PUBLIC_SITE_URL': 'https://web.test', 'ANALYTICS_URL': 'https://analytics.test'}
    assert not preflight.validate(env)
    assert preflight.validate({**env, 'NEXT_PUBLIC_SUPABASE_URL': 'https://yqzbsuandpdlvgtgnwln.supabase.co'})
    routing = load('accept-routing')
    with pytest.raises(AssertionError): routing.check_result({'status': 'conflict', 'routes': []})
    with pytest.raises(AssertionError): routing.check_result({'status': 'ok', 'routes': [{'geometry': {'coordinates': [[0, 0], [1, 1]]}}]})

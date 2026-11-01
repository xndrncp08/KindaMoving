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

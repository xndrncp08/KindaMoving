import pytest
from fastapi.testclient import TestClient

from km_analytics.api import app

from .fixtures import straight_run, to_fit, to_gpx

TOKEN = "t" * 40


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    return TestClient(app)


def auth(token=TOKEN):
    return {"Authorization": f"Bearer {token}"}


def test_requires_service_token(client):
    assert client.post("/v1/activities/parse?format=gpx", content=b"x").status_code == 401
    assert client.post("/v1/activities/parse?format=gpx", content=b"x", headers=auth("wrong" * 10)).status_code == 401


def test_refuses_to_run_with_weak_token(monkeypatch):
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", "short")
    r = TestClient(app).post("/v1/activities/parse?format=gpx", content=b"x", headers=auth("short"))
    assert r.status_code == 503


def test_parse_fit_and_gpx(client):
    for fmt, data in (("fit", to_fit(straight_run(600))), ("gpx", to_gpx(straight_run(600)))):
        r = client.post(f"/v1/activities/parse?format={fmt}&tz=America/Edmonton", content=data, headers=auth())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["summary"]["distance_m"] == pytest.approx(1800, rel=2e-3)
        assert body["track"]["type"] == "LineString" and body["local_date"] == "2026-10-01"


def test_malformed_file_is_a_clear_422(client):
    r = client.post("/v1/activities/parse?format=fit", content=b"garbage-bytes-here", headers=auth())
    assert r.status_code == 422 and r.json()["code"] == "invalid_file"
    assert client.post("/v1/activities/parse?format=kml", content=b"x", headers=auth()).status_code == 400
    assert client.post("/v1/activities/parse?format=gpx", content=b"", headers=auth()).status_code == 400


def test_oversized_payload_rejected(client):
    from km_analytics import api

    big = b"0" * (api.MAX_UPLOAD_BYTES + 1)
    assert client.post("/v1/activities/parse?format=gpx", content=big, headers=auth()).status_code == 413


def test_ghost_endpoint_validates_and_aligns(client):
    from .test_ghost import LOOP, streams

    assert client.post("/v1/ghost/align", json={"ref": {}}, headers=auth()).status_code == 400
    r = client.post("/v1/ghost/align", json={"ref": {"streams": streams(LOOP, 3.0)}, "ghost": {"streams": streams(LOOP, 2.9)}}, headers=auth())
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_form_endpoint_requires_configuration(client, monkeypatch):
    monkeypatch.delenv("FORM_MODEL_PATH", raising=False)
    assert client.post("/v1/form/analyze", content=b"x", headers=auth()).status_code == 503
    from .test_form import MODEL

    if MODEL.exists():
        monkeypatch.setenv("FORM_MODEL_PATH", str(MODEL))
        assert client.post("/v1/form/analyze?suffix=avi", content=b"x", headers=auth()).status_code == 400
        r = client.post("/v1/form/analyze", content=b"not a video", headers=auth())
        assert r.status_code == 422 and r.json()["code"] == "invalid_video"

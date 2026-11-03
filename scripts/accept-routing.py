"""Compute-only pilot acceptance after an approved import; never saves/imports routes."""
import json
import os
import sys
import time
import urllib.request
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
spec = spec_from_file_location('smoke', Path(__file__).with_name('smoke-production.py'))
smoke = module_from_spec(spec)
spec.loader.exec_module(smoke)


def check_result(result, tempo=False):
    assert result.get('status') == 'ok' and result.get('routes'), 'No pilot route returned'
    route = result['routes'][0]
    coords = route['geometry']['coordinates']
    assert 2 <= len(coords) <= 20000
    assert all(len(c) >= 2 and -114.6 <= c[0] <= -113.4 and 50.6 <= c[1] <= 51.5 for c in coords)
    if tempo:
        assert route['metrics']['tempo_major_crossings'] == 0
        assert route['metrics']['tempo_minor_crossings'] == 0
    return coords


def main():
    try:
        base = smoke.origin(os.environ['ANALYTICS_URL'])
        token = os.environ['ANALYTICS_SERVICE_TOKEN']
        assert smoke.request(base, '/readyz', token)[0] == 200, 'Readiness failed'
        opener = urllib.request.build_opener(smoke.NoRedirect)
        def post(path, body):
            req = urllib.request.Request(base+path, data=json.dumps(body).encode(), headers={
                'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
            with opener.open(req, timeout=40) as r:
                raw = r.read(8*1024*1024+1)
                assert len(raw) <= 8*1024*1024
                return json.loads(raw)
        observations = []
        for name, extra in [('loop', {}), ('out_and_back', {'shape': 'out_and_back'}),
                            ('structured_tempo', {'tempo_m': 2000, 'tempo_max_major': 0, 'tempo_max_minor': 0})]:
            started = time.monotonic()
            result = post('/v1/routes/generate', {'lat': 51.0532, 'lon': -114.0727,
                'distance_m': 6000, 'tolerance': .12, 'max_results': 1, **extra})
            coords = check_result(result, name == 'structured_tempo')
            report = post('/v1/routes/validate', {'coordinates': coords})
            assert report['valid'] and report['network_coverage'] == 1.0
            observations.append({'case': name, 'seconds': round(time.monotonic()-started, 3), 'points': len(coords)})
        print(json.dumps({'verified': observations, 'scope': 'compute-only pilot; GPX/save and full-city coverage not verified'}))
        return 0
    except Exception:
        print('Routing acceptance failed; inspect readiness, approved pilot coverage and credentials privately.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

# km-analytics

Python 3.12 FastAPI service for KindaMoving's compute-heavy work: GPX/FIT processing, running analytics, route generation and ghost alignment. It holds no user credentials. The web tier authenticates users, enforces ownership and calls this service with a shared bearer token.

```sh
python3.12 -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/python -m pytest -q
ANALYTICS_SERVICE_TOKEN=$(openssl rand -hex 32) .venv/bin/uvicorn km_analytics.api:app --port 8765
```

| Variable                  | Purpose                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ANALYTICS_SERVICE_TOKEN` | Required, ≥ 32 characters. Must equal the web app's `ANALYTICS_SERVICE_TOKEN`. The service returns 503 without it.         |
| `NETWORK_DATABASE_URL`    | Read-only Postgres URL for the routing network (see `docs/ROUTING.md`). Optional; routing endpoints return 503 without it. |

See `docs/ACTIVITY_PROCESSING.md` and `docs/RUNNING_METRICS.md` for algorithms and assumptions.

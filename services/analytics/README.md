# km-analytics

Python 3.12 FastAPI service for KindaMoving's compute-heavy work: GPX/FIT processing, running analytics, route generation and ghost alignment. It holds no user credentials. The web tier authenticates users, enforces ownership and calls this service with a shared bearer token.

```sh
python3.12 -m venv .venv
.venv/bin/pip install -e '.[test]'
.venv/bin/python -m pytest -q
ANALYTICS_SERVICE_TOKEN=$(openssl rand -hex 32) .venv/bin/uvicorn km_analytics.api:app --port 8765
```

| Variable                  | Purpose                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANALYTICS_SERVICE_TOKEN` | At least 32 characters; must match the web service's private token.                                                                                               |
| `NETWORK_DATABASE_URL`    | `km_network_reader` connection with `sslmode=verify-full` and verified CA trust. Optional only in development; deployed staging/production require it at startup. |
| `KM_DEPLOYMENT`           | `development` locally; explicitly `staging` or `production` on the appropriate reviewed deployment.                                                               |
| `KM_STAGING_SUPABASE_REF` | Required in staging; must identify the approved isolated project and match the reader URL. The existing shared project is rejected.                               |

The example above is a development process. In staging/production, startup rejects missing or invalid configuration. `/healthz` proves process liveness only; `/readyz` also requires a usable restricted reader, Calgary network data and correct native database timezone rules. A running process with an empty network correctly remains unready. Do not switch to development mode or use an administrative DSN to bypass these gates.

Render installs the non-editable package with `pip install .`, binds `0.0.0.0:$PORT`, and uses `/readyz` as its HTTP health path. The root Blueprint describes production and billable compute; applying it unchanged is not a staging activation procedure. Review the exact workspace/service, source SHA, staging mode/ref and secret-manager changes before any infrastructure mutation. See [Phase 7 staging acceptance](../../docs/release/PHASE7_STAGING_ACCEPTANCE.md) for current status and approval gates.

See `docs/ACTIVITY_PROCESSING.md` and `docs/RUNNING_METRICS.md` for algorithms and assumptions.

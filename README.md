# KindaMoving ↗

**Run smarter. Suffer better.**

A running platform built on real data: GPX/FIT processing, evidence-based run analysis, workout-aware routing on the OpenStreetMap network, scored runnability conditions, training plans, ghost racing, gear analytics, pose-based form observations, and COROS integration through COROS's official MCP service. Next.js + Supabase (Postgres 17/PostGIS) + a Python analytics service.

## Start

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local     # Supabase URL/keys, analytics URL/token, secrets
python3.12 -m venv services/analytics/.venv
services/analytics/.venv/bin/pip install -e 'services/analytics[test]'   # add ,form for KM Form
ANALYTICS_SERVICE_TOKEN=… services/analytics/.venv/bin/uvicorn km_analytics.api:app --port 8765 &
npm run dev
```

Apply `supabase/migrations` in order and import a routing network (see [DEPLOYMENT](docs/DEPLOYMENT.md)). Marketing pages work without credentials. Use Node 22+ and Python 3.12.

## Verify

```sh
npm run check                                             # lint, typecheck, Vitest, Prettier, build
(cd services/analytics && .venv/bin/python -m pytest -q)  # Python suites
python3 scripts/test-database.py                          # all migrations + SQL suites on disposable PG17/PostGIS
python3 scripts/test-database.py --then "services/analytics/.venv/bin/python -m pytest -q services/analytics/tests/test_network_db.py"
npx playwright install chromium && npm run test:e2e
```

## What works

| Module              | Status                                                                                                                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity processing | GPX/FIT parsing with integrity checks, cleaning, moving time, splits, laps, best efforts, grade-adjusted pace, decoupling; durable idempotent imports; dedupe across files, COROS and manual entries                                                                                    |
| KM Analyze          | "Why was this run different?" (robust statistics, measured / modeled / context, evidence-linked explanations), PBs, volume, Edwards TRIMP, consistency, two-run comparison, weather context                                                                                             |
| COROS               | OAuth 2.1 + PKCE against COROS's official MCP service (discovery verified live), sealed tokens, refresh/revoke, capability detection, activity sync via original FIT files within the 50/day quota, confirmed route and workout pushes. **Not yet exercised with a real COROS account** |
| KM Routes           | Loop, out-and-back and tempo-section routes on the real OSM network with exact crossing counts, climbing, surface, lighting and hazards; explanations and conflict alternatives; editing, validation, GPX                                                                               |
| KM Conditions       | Runner reports + City of Calgary feeds, log-odds confidence with time decay and weather adjustment, moderation, route suitability, offline reporting                                                                                                                                    |
| KM Train            | Plans from measured volume and best efforts with workload constraints, structured workouts, compliance, missed-workout handling, conditions-aware alternatives                                                                                                                          |
| KM Ghost            | Position-aligned replay of two runs on the same route, gap chart, splits                                                                                                                                                                                                                |
| KM Gear             | Derived mileage (no double counting), default attribution, reconciliation, cost/km, wear projection, rotation                                                                                                                                                                           |
| KM Form             | MediaPipe pose observations (angles, cadence, step time) with quality gates, face-blurred annotated video, 7-day retention. **Accuracy on real footage not validated**                                                                                                                  |
| Platform            | Job state machine, cross-module cache sync, IndexedDB offline outbox/drafts/route copies, service worker, data export and account deletion                                                                                                                                              |

## Engineering guides

- [Local setup](docs/LOCAL_SETUP.md) and [environment variables](docs/ENVIRONMENT.md)
- [Architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [authentication](docs/AUTHENTICATION.md)
- [State conventions](docs/STATE_MANAGEMENT.md), [API contracts](docs/API_CONTRACTS.md)
- [Testing and verification limits](docs/TESTING.md), [contribution guide](CONTRIBUTING.md)
- Phase 2: [audit](docs/PHASE2_AUDIT.md), [processing](docs/ACTIVITY_PROCESSING.md), [metrics](docs/RUNNING_METRICS.md), [analytics](docs/ANALYTICS.md), [COROS](docs/COROS_INTEGRATION.md), [routing](docs/ROUTING.md), [conditions](docs/CONDITIONS.md), [training](docs/TRAINING.md), [ghost](docs/GHOST.md), [gear](docs/GEAR.md), [form](docs/FORM.md)
- [Security](docs/SECURITY.md), [performance](docs/PERFORMANCE.md), [deployment & operations](docs/DEPLOYMENT.md)
- [Phase 1 handoff](docs/CLAUDE_HANDOFF.md)

This is a verified foundation, not a deployed public service. Live Supabase configuration, SMTP, operational policies and integration acceptance remain launch requirements.

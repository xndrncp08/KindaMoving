# Architecture

## Layout

```
apps/web/src/app          Next.js pages, layouts and route handlers (the only user-facing runtime)
apps/web/src/components   Product UI: planner, analysis, conditions, training, ghost, gear, form
apps/web/src/lib          Queries, stores, sync, offline (IndexedDB), training, conditions, COROS, jobs
apps/web/src/lib/server   Server-only: analytics client, crypto, weather, conditions, official data, cron auth
services/analytics        Python 3.12 FastAPI: processing, analytics, routing, ghost, form
packages/ui | types | config  Primitives, shared Zod schemas/types, TS config
supabase/migrations       Ordered SQL source of truth (10 files)
supabase/tests            SQL contract suites run on disposable PG17 + PostGIS
docs                      Engineering docs (index in README)
```

## System view

```
                    ┌──────────────────────────── Browser ─────────────────────────────┐
                    │ TanStack Query (server state, ['user', id, …])  Zustand (UI)     │
                    │ RHF + Zod (forms)   URL params (navigable)   IndexedDB (offline) │
                    │ JobSync / OfflineSync state machines        service worker       │
                    └──────────────┬───────────────────────────────────────┬───────────┘
                    session cookie │ same-origin                           │ direct upload (storage RLS)
┌──────────────────────────────────▼────────────────────────┐    ┌─────────▼──────────┐
│ Next.js route handlers: context() → user-scoped client    │    │ Supabase Storage   │
│  • CRUD, analytics, routes, conditions, training, gear    │    │ activity-files     │
│  • enqueue_job → after(kickJobs) / cron /api/jobs/run     │    │ form-videos/results│
│  • runJobs (service role): import, COROS sync/push, form  │    └────────────────────┘
└────────┬───────────────────────────┬──────────────────────┘
         │ RLS / definer RPCs        │ Bearer ANALYTICS_SERVICE_TOKEN
┌────────▼─────────────────┐  ┌──────▼──────────────────────────────────┐   ┌──────────────┐
│ Postgres 17 + PostGIS     │◀─┤ km-analytics (FastAPI)                  │   │ COROS MCP    │
│ RLS on every table        │  │  parse/clean/metrics  explain  ghost     │   │ OAuth 2.1    │
│ job queue state machine   │  │  routing (graph cache)  form (MediaPipe) │   │ PKCE, tools  │
│ network (km_network_reader│  └──────────────────────────────────────────┘   └──────▲───────┘
│ select-only)              │                                                        │
└───────────────────────────┘          server-only, sealed tokens ──────────────────┘
External data: OpenStreetMap (ODbL), Open-Meteo (CC BY 4.0), City of Calgary Open Data.
```

## Principles kept from Phase 1

The caller's publishable-key client plus RLS is the default path. Identity is checked in every handler, not in layouts. Server responses live only in Query. Measurements are stored in metres and seconds, and display conversion happens at the edge.

## Phase 2 additions

- **Service role, narrowly**: job runner, COROS token vault, account deletion and cron imports. Each scopes queries by an owner ID verified upstream. Clients cannot reach worker RPCs (`claim_jobs`, `import_activity`, `vault_*`, `upsert_official_condition`).
- **Durable jobs**: `sync_jobs` with a trigger-enforced state machine, leases, backoff and idempotency keys. Kicked after the response with `after()`, drained by cron; the client polls only while jobs are active and turns completions into targeted cache invalidation (`lib/sync.ts`).
- **Python service**: stateless compute plus read-only network access. It never sees user credentials.
- **Cross-module synchronisation**: a job's success invalidates the modules it affects (`jobEffects`). Conditions reports or votes invalidate the shared `conditions` prefix, so overlays and route suitability refresh. Workout changes invalidate training and workouts. Gear writes invalidate gear, summary and activities. Stale and out-of-order responses are neutralised by key-scoped queries, aborted superseded requests (route snapping) and `updated_at`-guarded transition detection.

Module docs: [ACTIVITY_PROCESSING](ACTIVITY_PROCESSING.md), [RUNNING_METRICS](RUNNING_METRICS.md), [ANALYTICS](ANALYTICS.md), [COROS_INTEGRATION](COROS_INTEGRATION.md), [ROUTING](ROUTING.md), [CONDITIONS](CONDITIONS.md), [TRAINING](TRAINING.md), [GHOST](GHOST.md), [GEAR](GEAR.md), [FORM](FORM.md), [STATE_MANAGEMENT](STATE_MANAGEMENT.md), [SECURITY](SECURITY.md), [PERFORMANCE](PERFORMANCE.md), [DEPLOYMENT](DEPLOYMENT.md).

## Phase 3 deployment boundary

Vercel/Render configurations and readiness gates wrap the existing runtimes. No new application layer or state system was introduced. HTML now renders dynamically for nonce CSP; heavy client modules remain lazy. See [deployment](DEPLOYMENT.md) for scheduling, security headers, hosting budgets and rollback.

# Deployment and operations

## Components

| Component                        | Runtime                                     | Notes                                                                                                                        |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Web (`apps/web`)                 | Node 22, Next.js 16                         | Any Node host (e.g. Vercel). Route handlers use `after()`; set `maxDuration` ≥ 60 s for `/api/jobs/run` and route generation |
| Analytics (`services/analytics`) | Python 3.12, `uvicorn km_analytics.api:app` | Container or PaaS (e.g. Render). Install `.[form]` and provide `FORM_MODEL_PATH` only if KM Form is enabled                  |
| Database                         | Supabase Postgres 17 + PostGIS              | Apply `supabase/migrations` in order                                                                                         |
| Storage                          | Supabase Storage                            | Buckets created by migrations: `activity-files`, `form-videos`, `form-results`                                               |

## Environment

Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SECRET_KEY`, `ANALYTICS_URL`, `ANALYTICS_SERVICE_TOKEN`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), optional `OPEN_METEO_API_KEY` / `WEATHER_DISABLED`.
Analytics: `ANALYTICS_SERVICE_TOKEN` (same value), `NETWORK_DATABASE_URL` (the `km_network_reader` login), optional `FORM_MODEL_PATH`.

## First deployment

1. Apply migrations (`npx supabase db push`, or run each file in order in the SQL editor), then run the Supabase security and performance advisors.
2. `alter role km_network_reader with login password '<random>';` then build `NETWORK_DATABASE_URL` from the pooler host with that role.
3. Import the pilot network: `scripts/import_network.py --region calgary --bbox -114.32,50.84,-113.86,51.21 --elevation open-meteo --database-url "$ADMIN_URL"`. For the whole city, import in tiles, or from a Geofabrik Alberta extract filtered to Calgary, to respect Overpass usage limits.
4. Download the pose model if KM Form is enabled: `curl -L -o models/pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task` (sha256 `59929e1d…690d574a`).
5. Supabase Auth: add the site URL and `/auth/callback` to the redirect allowlist; configure SMTP and rate limits.
6. COROS: nothing to pre-register. The app registers itself dynamically per issuer and redirect URI on the first connect (`/api/coros/callback`).

## Schedules (`Authorization: Bearer $CRON_SECRET`)

| Endpoint                       | Suggested cadence | Purpose                                                                                |
| ------------------------------ | ----------------- | -------------------------------------------------------------------------------------- |
| `GET /api/jobs/run`            | every minute      | Durable job drain (imports, COROS sync/pushes, form analysis); recovers expired leases |
| `GET /api/conditions/official` | every 15 minutes  | City of Calgary closures and incidents                                                 |
| `GET /api/form/cleanup`        | daily             | Delete annotated videos past their 7-day retention                                     |

Vercel Hobby crons run at most daily, so use a plan with minute crons or an external scheduler for `/api/jobs/run`. Uploads and syncs still start immediately through `after()`.

## Operations

- **Job health**: `sync_jobs` by status; `sync_job_events` holds every transition (users see their own under Settings → COROS → Diagnostics). Stuck `running` rows self-heal when their lease expires.
- **COROS quota**: `connected_provider_accounts.fit_quota`; deferred records show as `deferred_quota` and resume automatically.
- **Backups**: Supabase PITR or daily backups; the network can be re-imported from source.
- **Rotating `TOKEN_ENCRYPTION_KEY`** invalidates stored COROS tokens (users reconnect). Plan a dual-key rotation before doing it on a live system.

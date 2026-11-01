# Environment variables

| Variable                                  | Purpose                                                             | Required                              |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                | Supabase project API URL                                            | Auth/data                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`    | Public project key, subject to RLS                                  | Auth/data                             |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`         | `true` shows Google sign-in after provider configuration            | Optional, false by default            |
| `NEXT_PUBLIC_SITE_URL`                    | Canonical origin for metadata and sitemap                           | Set for deployment                    |
| `PG_BIN`                                  | PostgreSQL binaries for disposable SQL test                         | Optional, Homebrew 17 default locally |
| `SUPABASE_SECRET_KEY`                     | Service-role key for the job runner, token vault, deletion          | Background work; server only          |
| `ANALYTICS_URL`                           | Base URL of the Python analytics service                            | Imports, analytics, routing           |
| `ANALYTICS_SERVICE_TOKEN`                 | Shared bearer token (≥ 32 chars) for the analytics service          | With `ANALYTICS_URL`                  |
| `TOKEN_ENCRYPTION_KEY`                    | 32-byte base64 AES-256-GCM key sealing COROS tokens and OAuth state | COROS; server only                    |
| `OPEN_METEO_API_KEY` / `WEATHER_DISABLED` | Commercial weather key / disable weather enrichment                 | Optional                              |
| `CRON_SECRET`                             | Bearer secret (≥ 32 chars) for `GET /api/jobs/run`                  | Durable job processing                |

Next public variables are included in client bundles. Service-role keys, provider tokens and database passwords must never use this prefix or enter browser code. Phase 2 introduces one server-only service-role key (`SUPABASE_SECRET_KEY`), used solely by the job runner, the COROS token vault and account deletion. Each of those code paths scopes every query by an owner ID verified upstream. Files under `.env*` are ignored except the example. No secrets are committed.

The app uses the actual browser/request origin for PKCE callbacks. Supabase's redirect allowlist must match that origin. Reverse proxies must preserve the public origin so mutation Origin validation remains correct. Auth/data responses are private/no-store; never put them behind a shared cache.

## Phase 3 deployment validation

Set `KM_DEPLOYMENT=production` in real Vercel and Render environments; local examples use development/unset. Next's instrumentation validates required public/server keys, HTTPS origins, independent >=32-character service/cron secrets, the 32-byte base64 encryption key, and commercial-weather configuration. It fails startup with variable names only. Keep the existing encryption key during release; generating a replacement invalidates stored COROS credentials.

Render requires the analytics token and `NETWORK_DATABASE_URL` with the `km_network_reader` login and `sslmode=verify-full`. When supplied, `FORM_MODEL_PATH` must exist. Render's `.env.example` is a reference, not an automatically loaded secret file. Set provider environment values directly. Do not set `NETWORK_ADMIN_DATABASE_URL` on the analytics service; it is only for a separately approved operator import.

`WEB_BASE_URL` is used only by the read-only smoke script/workflow. Set it and `ANALYTICS_URL` as trusted GitHub `production` environment variables; store bearer tokens as protected environment secrets. Smoke refuses credential-bearing URLs and redirect-following. [Production requirements](PRODUCTION_REQUIREMENTS.md) enumerates all credentials, quotas/costs and manual steps.

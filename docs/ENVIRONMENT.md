# Environment variables

| Variable                               | Purpose                                                    | Required                              |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project API URL                                   | Auth/data                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public project key, subject to RLS                         | Auth/data                             |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`      | `true` shows Google sign-in after provider configuration   | Optional, false by default            |
| `NEXT_PUBLIC_SITE_URL`                 | Canonical origin for metadata and sitemap                  | Set for deployment                    |
| `PG_BIN`                               | PostgreSQL binaries for disposable SQL test                | Optional, Homebrew 17 default locally |
| `SUPABASE_SECRET_KEY`                  | Service-role key for the job runner, token vault, deletion | Background work; server only          |
| `ANALYTICS_URL`                        | Base URL of the Python analytics service                   | Imports, analytics, routing           |
| `ANALYTICS_SERVICE_TOKEN`              | Shared bearer token (≥ 32 chars) for the analytics service | With `ANALYTICS_URL`                  |
| `CRON_SECRET`                          | Bearer secret (≥ 32 chars) for `GET /api/jobs/run`         | Durable job processing                |

Next public variables are included in client bundles. Service-role keys, provider tokens and database passwords must never use this prefix or enter browser code. Phase 2 introduces one server-only service-role key (`SUPABASE_SECRET_KEY`), used solely by the job runner, the COROS token vault and account deletion. Each of those code paths scopes every query by an owner ID verified upstream. Files under `.env*` are ignored except the example. No secrets are committed.

The app uses the actual browser/request origin for PKCE callbacks. Supabase's redirect allowlist must match that origin. Reverse proxies must preserve the public origin so mutation Origin validation remains correct. Auth/data responses are private/no-store; never put them behind a shared cache.

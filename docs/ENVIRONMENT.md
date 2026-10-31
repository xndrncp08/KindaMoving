# Environment variables

| Variable                               | Purpose                                                  | Required                              |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project API URL                                 | Auth/data                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public project key, subject to RLS                       | Auth/data                             |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`      | `true` shows Google sign-in after provider configuration | Optional, false by default            |
| `NEXT_PUBLIC_SITE_URL`                 | Canonical origin for metadata and sitemap                | Set for deployment                    |
| `PG_BIN`                               | PostgreSQL binaries for disposable SQL test              | Optional, Homebrew 16 default locally |

Next public variables are included in client bundles. Service-role keys, provider tokens and database passwords must never use this prefix or enter browser code. No service-role credential is needed by Phase 1. Files under `.env*` are ignored except the example. No secrets are committed.

The app uses the actual browser/request origin for PKCE callbacks. Supabase's redirect allowlist must match that origin. Reverse proxies must preserve the public origin so mutation Origin validation remains correct. Auth/data responses are private/no-store; never put them behind a shared cache.

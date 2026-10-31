# Authentication

The implementation follows Supabase's current SSR cookie client guidance, checked October 31, 2026: https://supabase.com/docs/guides/auth/server-side/creating-a-client . The changelog was reviewed, including the November TLS deprecation and local timezone database fix; use an up-to-date Supabase Postgres image for Edmonton time.

`lib/supabase/server.ts` creates a request-scoped server client. `proxy.ts` refreshes/verifies claims, propagates cookies and the cache headers supplied by `@supabase/ssr`, and marks personalized responses no-store. Server components cannot write cookies, so they rely on this proxy. Route handlers and protected layouts call `getUser()` for authoritative current-user verification. `getSession()` and user-editable metadata are never trusted for access control.

Email/password signup requires at least 12 characters in the app; match this minimum in Supabase Auth configuration. Enable email confirmation. The signup callback exchanges a PKCE code for a session, validates a local `next` path, then routes through profile onboarding. Login, logout and password update use actual Supabase outcomes. Recovery emails point to the PKCE callback and account password settings. Signup confirmation and password recovery must be tested with the project's actual SMTP configuration.

Google appears only when `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. Configure Google client ID/secret in Supabase, configure Google's Supabase callback, and allow app `/auth/callback` URLs in Supabase. No fake connected state is displayed when unavailable.

Apply migrations first. A missing profile sends an authenticated runner to onboarding. Database failures surface as errors instead of redirect loops. Every API route independently verifies identity and checks Origin for writes; RLS and ownership foreign keys protect direct Data API access. Server APIs never accept caller-selected owner IDs.

## Deployment acceptance

- Test confirmation email, expired callback, password login, Google (if enabled), refresh, recovery and logout with two real accounts.
- Verify user A cannot access user B's records or storage through REST directly.
- Configure SMTP, redirect allowlists, rate limits and bot protections appropriate to public signup traffic.
- Match hostname consistently; preserve public origin across reverse proxies.
- Validate private/no-store responses at the deployed CDN.

No live Auth or OAuth acceptance is claimed without configured credentials. Auth tests here exercise local boundaries and mocked SDK/UI behavior; SQL tests exercise actual PostgreSQL policies with an auth identity test double.

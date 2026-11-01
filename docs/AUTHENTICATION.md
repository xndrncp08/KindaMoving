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

## Production configuration checklist (Phase 3)

Set the Supabase **Site URL** to the exact canonical HTTPS app origin. Add that origin's `/auth/callback` to the redirect allowlist and explicitly add only reviewed staging origins. Keep localhost callbacks in the development project. Do not grant a wildcard for all `*.vercel.app` projects access to production authentication. Google uses the Supabase provider callback URL (shown in its dashboard), with app callback URLs configured separately; keep the public Google flag false until tested. COROS has its own `/api/coros/callback` and per-origin dynamic registration and is not a Supabase social provider.

Enable confirmed email and the app's minimum 12-character password policy in Auth. Configure custom SMTP host/port/user/password, verified From domain/address, SPF/DKIM and appropriate DMARC; verify delivered confirmation and recovery messages in a **staging** account. Keep the confirmation/recovery templates' Supabase confirmation URL/redirect parameters so the existing PKCE code-exchange callback is reached. Test on the same browser initiating PKCE and test expired/used links. Disable email-provider click tracking if it rewrites/breaks one-use links. Review bounce suppression and quotas with the email provider.

Supabase's built-in SMTP is not a production mail service: it restricts recipients to authorized/team addresses, currently limits delivery to about two messages per hour, and offers no delivery SLA. Custom SMTP removes that test sender restriction but requires you to review **Authentication → Rate Limits** and your SMTP provider's own limits. Keep endpoint/IP and email resend throttles enabled; current documented signup/sign-in defaults are 30 requests/5 minutes with bounded bursts. Start within the verified mail provider allowance, monitor 429s/delivery failures, and increase only with an abuse/volume justification. Do not make the service-role key public or disable rate limits to fix failed signup. Configure bot protection before unrestricted public signup where appropriate.

Sources checked 2026-11-01: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). These are operator setup requirements; no live Auth settings were changed in Phase 3.

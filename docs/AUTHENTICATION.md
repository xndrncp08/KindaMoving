# Authentication

The implementation follows Supabase's current SSR cookie client guidance, checked October 31, 2026: https://supabase.com/docs/guides/auth/server-side/creating-a-client . The changelog was reviewed, including the November TLS deprecation and local timezone database fix; use an up-to-date Supabase Postgres image for Edmonton time.

`lib/supabase/server.ts` creates a request-scoped server client. `proxy.ts` refreshes/verifies claims, propagates cookies and the cache headers supplied by `@supabase/ssr`, and marks personalized responses no-store. Server components cannot write cookies, so they rely on this proxy. Route handlers and protected layouts call `getUser()` for authoritative current-user verification. `getSession()` and user-editable metadata are never trusted for access control.

Email/password signup requires at least 12 characters in the app; match this minimum in Supabase Auth configuration. Login does not enforce it (older accounts may predate it). Enable email confirmation. Login, logout and password update use actual Supabase outcomes. Signup confirmation and password recovery must be tested with the project's actual SMTP configuration.

## Journeys and states

All signed-out screens share `AuthShell` (`components/auth-shell.tsx`). Mode is URL state, so Back/forward and shared links work:

| URL                      | Screen                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `/login`                 | Log in. `?next=` (same-origin only, via `safeNext`) is where a successful login lands.     |
| `/login?mode=signup`     | Create account → "Check your inbox" with a 60-second resend cooldown.                      |
| `/login?mode=reset`      | Request a reset link → "Check your inbox"; copy never says whether the account exists.     |
| `/login?error=<problem>` | `expired`, `device`, `cancelled` or `session` from `linkProblems` in `lib/auth-errors.ts`. |
| `/auth/reset`            | Choose a new password (needs the recovery session), or an expired-link state.              |
| `/onboarding`            | Five profile questions; everything else keeps defaults until Settings.                     |

- **Protected routes.** `proxy.ts` sends a signed-out request for `/app/*` or `/onboarding` to `/login?next=<path>`, and a signed-in visit to `/login` straight to `next` (or `/app`). It redirects only on a clean "no session" result; refresh/network failures fall through to `requireUser`, which sends the runner to `/login?error=session`. The `error` parameter suppresses the signed-in bounce, so the two can never loop.
- **Errors.** `authProblem()` maps Supabase error codes (invalid credentials, unconfirmed email, rate limits/429, weak or reused password, reauthentication, network failure) to plain language. Unknown codes get a generic line; raw provider text is never shown. An unconfirmed login offers to resend the confirmation email.
- **Enumeration.** Signup answers an existing address exactly like a new one (with confirmations enabled Supabase does this itself; `user_already_exists` is folded into the same screen when it does not). Reset requests always show the same inbox screen.
- **Password reset.** Saving the new password calls `signOut({ scope: 'global' })`, ending every session (including any attacker's), then returns to `/login?reset=done` so the runner proves the new password and their password manager saves it (a hidden `username` field associates it).
- **Forms.** `method="post"` and `noValidate` with accessible inline errors (`aria-invalid` + `aria-describedby`), validation on leaving a field, `autocomplete` (`username`, `current-password`, `new-password`), `enterkeyhint`, a show/hide toggle outside the label, and submit buttons that stay disabled until navigation completes.

## Callback

`/auth/callback` handles three inputs and always redirects to a same-origin path:

1. Provider error parameters (`error`, `error_code`) → `/login?error=expired|cancelled`.
2. `token_hash` + `type` (allowlisted OTP types) → `verifyOtp`. This works on **any device**. Recovery defaults to `/auth/reset`.
3. `code` → PKCE `exchangeCodeForSession`. This needs the browser that started the flow; a missing verifier becomes `/login?error=device`.

The default Supabase templates use `{{ .ConfirmationURL }}` and reach path 3. To make email links work across devices, set the templates to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` (confirm signup) and `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery` (reset password). This is an operator change in the Supabase dashboard and has not been applied to any hosted project.

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

Enable confirmed email and the app's minimum 12-character password policy in Auth. Configure custom SMTP host/port/user/password, verified From domain/address, SPF/DKIM and appropriate DMARC; verify delivered confirmation and recovery messages in a **staging** account. Keep the confirmation/recovery templates' Supabase confirmation URL/redirect parameters (PKCE, same browser) or switch them to the `token_hash` form above (any device). Test expired/used links either way. Disable email-provider click tracking if it rewrites/breaks one-use links. Review bounce suppression and quotas with the email provider.

Supabase's built-in SMTP is not a production mail service: it restricts recipients to authorized/team addresses, currently limits delivery to about two messages per hour, and offers no delivery SLA. Custom SMTP removes that test sender restriction but requires you to review **Authentication → Rate Limits** and your SMTP provider's own limits. Keep endpoint/IP and email resend throttles enabled; current documented signup/sign-in defaults are 30 requests/5 minutes with bounded bursts. Start within the verified mail provider allowance, monitor 429s/delivery failures, and increase only with an abuse/volume justification. Do not make the service-role key public or disable rate limits to fix failed signup. Configure bot protection before unrestricted public signup where appropriate.

Sources checked 2026-11-01: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). These are operator setup requirements; no live Auth settings were changed in Phase 3.

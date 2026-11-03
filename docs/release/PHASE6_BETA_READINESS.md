# Phase 6 — Infrastructure and integration readiness

2026-11-03. Base main `69d31de`; branch `chore/phase6-beta-readiness`.

**Private beta remains blocked.** This release hardens the existing system and prepares isolation; it does not provision a project, change shared Supabase data, install credentials, import a hosted network, promote production or invite users.

## Actual infrastructure

| Resource                                 | Current observation                                                                                                                                                                                                                                      | Classification                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Intended Supabase `yqzbsuandpdlvgtgnwln` | Management access denied; listing returns only an unrelated project. No substitute selected. Owner organization, region, isolated capacity and billing approval still required.                                                                          | Blocked                                           |
| Isolated staging Supabase                | Not provisioned; no independent Auth, DB, Storage or credentials claimed.                                                                                                                                                                                | Blocked                                           |
| Existing Vercel `kindamoving-staging`    | Project `prj_WldDezKdgZIpA1ywKpXhiEzWnSaW`, SSO on all deployments; existing protected Phase 5 preview health 200. No Phase 6 deployment attempted against its shared credentials.                                                                       | Verified existing availability; isolation blocked |
| Render `kindamoving-analytics-staging`   | `srv-dbjjdgdg1s2s73ftupqg`, Oregon, free plan, auto deploy off, empty health path, no open port. Latest `dep-dbjjdgtg1s2s73fturf0`, source `b8392408`, update_failed. Logs show startup failure; health/readiness requests each timed out at 12 seconds. | Blocked                                           |
| Hosted routing                           | Last verified counts are Phase 5's zero rows; Phase 6 has not changed/reference-imported any hosted data. Current hosted data availability cannot be re-attested through management SQL.                                                                 | Blocked                                           |
| Physical phones                          | No accessible physical device/test tooling; Docker/local Supabase stack also unavailable. Hardware sign-off is unchanged and pending.                                                                                                                    | Unverified                                        |

Existing protected preview: <https://kindamoving-staging-mlmenszrr-xander-rancaps-projects.vercel.app>.
A READY frontend is not dependency readiness or beta acceptance.

## Implemented and verified locally

- `KM_DEPLOYMENT=staging` now validates an explicit separate project ref in both runtimes. Web URL and reader DSN must match it; the documented shared project is rejected. Unknown deployment modes fail validation. Production behavior retains its existing validation.
- The preview helper rejects CLI overrides (including `--prod`) and missing/shared refs before contacting Vercel. It forces staging mode/ref at build and runtime, so an old shared public URL fails startup rather than silently serving a new candidate.
- Separate web and analytics secret templates live under `config/`. Analytics receives no service-role or writer key. `scripts/validate-staging.py` checks consistency without network mutations and explicitly does not certify ownership/provisioning.
- Analytics no longer treats HTTP-200 proxy HTML, invalid JSON or an interrupted JSON response as successful compute. Caller cancellation is combined with the service deadline. Errors remain redacted; redirects remain forbidden.
- Account export fails closed when rate-limit admission fails or returns no decision. Existing RLS already restricts raw condition-report exports to their owner; no community-read ownership rewrite was needed.
- Offline replay is scoped to identity, cancelled on logout/account transition/unmount, and ignores late old-account responses. Cancelled requests are not misclassified as server rejections; unsent data remains subject to the existing identity purge. A regression covers an in-flight response completing after cancellation without sending the next old item.
- Readiness has a four-second HTTP deadline and one in-flight dependency probe, even if DNS/DB work is slower. Late probe exceptions are consumed without leaking connection details. Liveness stays independent; startup validation is not bypassed.
- Reader admission rejects role escalation, inherited memberships, public-schema CREATE, writes including TRUNCATE and access to non-network user tables. DSN query parameters cannot override the inspected host/user/database. Real disposable PostGIS verifies an actual reader succeeds and TRUNCATE is rejected.
- Reference graph caches include a one-way digest of connection identity. Reusing the same coordinates against a different DSN can no longer return the previous database's graph.
- `scripts/accept-routing.py` prepares real HTTPS compute-only loop, out-and-back and zero-crossing tempo acceptance, checks generated geography and validates geometry through the service. It never saves/imports/deletes data and fails honestly on unavailable readiness or missing routes. It has not passed against hosted routing.

No state library, product module, design language, routing algorithm, analytics model or schema was replaced. Existing migrations are reused; no new migration is required for these code fixes.

## Isolation runbook — operator approval required

1. Regain scoped access to **the intended** project/organization. Confirm ownership, region, project limits and a cost quote. Explicitly approve a new separate KindaMoving staging project before creating anything billable. Do not use the unrelated accessible project. Record the new ref and operator approval; keep the existing shared project untouched.
2. Create a fresh DB/Auth/Storage project; copy **no** shared users, rows, tokens, provider clients or storage objects. Review all existing `supabase/migrations/*.sql` (11 files). Against only the approved new ref, preview the migration plan:

   ```sh
   npx supabase db push --project-ref "$KM_STAGING_SUPABASE_REF" --dry-run --skip-vault
   ```

   The installed CLI documents Vault updates before migrations, so retain `--skip-vault`. Use private credential storage/prompts, never `--password`/DSNs in arguments. Apply only after review with a separately approved invocation removing `--dry-run`; omit `--include-seed`. Never run reset on a hosted/shared target. Run advisors, ownership checks and native timezone acceptance afterward.

3. Configure private buckets through the existing migrations and inspect policies/limits. Create only dedicated synthetic accounts on the isolated project, using an operator-owned email domain. Keep a run-specific account inventory for safe cleanup. Never delete pre-existing users as test teardown.
4. Set isolated Auth Site URL to a stable protected staging origin; allow exact `/auth/callback` URLs for confirmation/recovery. Configure verified SMTP sender, confirmations, password policy and rate limits; test expired/reused links. Configure Google separately if enabled. COROS `/api/coros/callback` registration is separate from Supabase Auth callbacks and belongs to the isolated origin/issuer.
5. Populate `config/staging-web.env.example` and `config/staging-analytics.env.example` through private secret storage. Use fresh staging-only Supabase keys, fresh encryption key (do **not** rotate/copy the shared key), a matching random service token on web/analytics and a distinct scheduler token. Never bulk-import writer credentials into a deployment. Rebuild after public-variable changes.
6. Activate the isolated reader using [NETWORK_IMPORT](../NETWORK_IMPORT.md#operator-only-reader-activation-phase-5), substituting the approved **new** project throughout. Check all privileges, hidden-prompt password setup, verified pooler/direct host, CA trust and `sslmode=verify-full`. Supply the writer only to a private import session. The shared project's existing reader is not to be altered under this Phase 6 authorization.
7. With the two staging environments supplied privately to one operator process, run:

   ```sh
   services/analytics/.venv/bin/python scripts/validate-staging.py
   ```

   A pass proves configuration consistency only. Verify actual project ownership, key binding, Auth, Storage/RLS and native tzdata against the provisioned project. Project URL/ref matching is not proof that opaque keys or billing are correct.

8. Verify the linked Vercel team/project and SSO before deploying. Set its Preview variables to the isolated web values. `KM_STAGING_SUPABASE_REF=<approved-ref> bash scripts/deploy-staging.sh` exports committed HEAD only; no overrides/production flags are accepted. Leave production and shared Supabase unchanged.
9. Configure Render with the isolated reader/token, Python 3.12, installed non-editable package and `/readyz` health path. Deploy the reviewed SHA manually. Record deploy ID and actual live readiness, then verify Vercel-to-Render calls. No secret reset/health bypass is a substitute for this.
10. Separately review/approve the pilot import and backup/reference-data recovery plan. Reproduce dry-run, then explicitly approve `--apply`; replacement needs another explicit approval/flag. Restart analytics after approved imports. Run native DB timezone acceptance and the compute-only routing acceptance script, then saved-route/GPX tests with synthetic ownership.
11. Review hosting/cadence/costs before enabling jobs. Hobby is daily-only; preview schedules do not demonstrate a running drain. Free Render sleeps and is not proven adequate for sustained jobs/media. The existing Pro/always-on proposal is not a purchased plan. Review OSM/Open-Meteo/municipal terms, SMTP/Storage/egress quotas and spend alerts in [PRODUCTION_REQUIREMENTS](../PRODUCTION_REQUIREMENTS.md). Avoid duplicate schedulers.
12. Complete the following workflows and hardware worksheet before invitations. Record URLs, exact SHAs, scenario evidence and failures; passing local tests never fills a hosted/hardware gate.

## Fifteen hosted workflows — Phase 6 status

No new sessions, test accounts, uploads, reports, deletions, OAuth writes or reference imports were created on shared staging. Phase 5 hosted reads are historical evidence, not a new isolated acceptance pass.

| #   | Workflow                    | Independently verified evidence / remaining hosted action                                                                                                                      | Classification                       |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| 1   | Auth/onboarding             | Existing SDK/UI/schema/ownership tests retained. Isolated signup, SMTP, recovery, session refresh and two-user isolation needed.                                               | Blocked hosted                       |
| 2   | GPX/FIT                     | Parser/security tests and local TypeScript→FastAPI FIT/error round trip. Upload→Storage→job→analysis/dedup needs isolation and healthy analytics.                              | Verified local / Blocked hosted      |
| 3   | COROS authorization         | PKCE/discovery/token-vault contracts tested; no authorized real account supplied.                                                                                              | Blocked                              |
| 4   | COROS sync                  | Quota/dedup/retry contracts retained. Needs approved PACE 4 owner, watch→COROS app upload and real original FIT retrieval.                                                     | Blocked                              |
| 5   | Analyze                     | Existing metrics/chart tests; synthetic chart component profile below. New imported activity and explanation must succeed on isolated services.                                | Verified local / Blocked hosted      |
| 6   | Compare                     | Existing comparison/ghost contracts retained; isolated real two-run comparison needed.                                                                                         | Blocked hosted                       |
| 7   | Generate routes             | Real disposable PostGIS tests; prepared compute-only acceptance for three route shapes. No approved hosted network.                                                            | Verified local / Blocked hosted      |
| 8   | Edit/export                 | Existing snapping/validation/GPX contracts retained. Save owned route, edit, validate, export and native file handoff needed after import.                                     | Blocked hosted/device                |
| 9   | Conditions                  | Existing report/vote/RLS tests, offline replay cancellation regression. Isolated report/vote and server idempotency needed.                                                    | Verified local / Blocked hosted      |
| 10  | Condition-aware suitability | Disposable PostGIS contracts; real isolated report→corridor/suitability refresh needed.                                                                                        | Blocked hosted                       |
| 11  | Training                    | Existing plan/compliance tests; isolated generation, apply and completion needed.                                                                                              | Blocked hosted                       |
| 12  | Gear                        | Existing mileage/assignment/SQL contracts; isolated assign/unassign/default-shoe reconciliation and dashboard refresh needed.                                                  | Blocked hosted                       |
| 13  | Ghost                       | Existing matching/replay tests; real isolated pair and phone replay needed.                                                                                                    | Blocked hosted/device                |
| 14  | Offline                     | IndexedDB tests including identity cancellation; Phase 5 intercepted emulation retained. Force-close/airplane-mode/server-dedup/account-switch acceptance pending.             | Verified local / Unverified hardware |
| 15  | Export/delete               | Rate-limit failure now fails closed; SQL ownership/cascade tests retained. Isolated export token exclusion, revocation and complete own-account Storage/row deletion required. | Blocked hosted                       |

For each isolated journey record initial records, request/job IDs, resulting durable state, rejected cross-user access and cleanup of only its newly created fixture. Never equate HTTP 202 with completed processing. No destructive workflow may target shared data.

## COROS PACE 4 acceptance

Reviewed current official [README](https://github.com/coroslab/COROS-MCP), [tools](https://github.com/coroslab/COROS-MCP/blob/main/docs/en/tools.md) and [FAQ](https://github.com/coroslab/COROS-MCP/blob/main/docs/en/faq.md): original FIT files/links share 50 files per fixed 24-hour window; access tokens last 30 days, rotating refresh tokens 180 days. Existing 48-file safety budget remains. No watch-model-specific BLE/live GPS/control capability is invented: PACE 4 activities must first reach COROS through its supported app flow.

With an expressly authorized account: inspect issuer/redirect and consent, complete exchange/tools-list, retrieve a known running activity, validate observed machine payloads, import its original FIT, repeat sync/file upload to prove dedup, exercise refresh/reconnect, check quota continuation without exhausting the real allowance, disconnect and verify revocation/local-vault/job cleanup while retaining imports. Route/workout writes require explicit per-item confirmation; uncertain external writes must not automatically retry. No account acceptance or write was attempted this phase.

## Performance and device evidence

Phase 5's 622→37 ms initial Analyze TBT comparison is retained as historical Lighthouse 12.8.2 lab evidence. No new authenticated comparison is claimed: creating a shared Auth test session is outside this phase's boundary.

To investigate first reveal independently, a test-only fixture renders the actual chart component with 600 explicitly synthetic samples. Five fresh Chromium trials, 393×852/DPR1, applied CPU4×, local unthrottled assets: median all-three-chart appearance **556 ms**, median longest task **122 ms** (range 118–127 ms). [Sanitized observations](phase6-chart-lab.json). This is component initialization, not authenticated-app INP, phone latency or an optimization over the earlier ~150 ms app observation. No chart data, accessibility or rendering functionality was removed to improve a score. Main-thread rendering remains a device acceptance risk; no performance gain is claimed.

Reproduce in a disposable checkout only: copy `apps/web/e2e/fixtures/chart-lab.tsx` into `apps/web/src/app/chart-lab/page.tsx`, `npm ci`, `npm run build`, start on unused port 3016, then run `KM_LAB_URL=http://127.0.0.1:3016 node apps/web/scripts/chart-lab.mjs` from the repository root. The fixture is outside production routes in Git; never copy it into a deployment. The script rejects non-loopback hosts and requires its exact synthetic heading/all three rendered curves.

[The physical-device worksheet](../design/MOBILE.md#phase-5-hardware-sign-off-worksheet-all-pending) remains executable and all hardware cells pending: small/large iOS Safari and Android Chrome, installed PWAs, portrait/landscape, safe areas/chrome, real keyboards/GPS/pickers, map pan/pinch, sheet momentum/cancel, native Back, VoiceOver/TalkBack, offline restart and GPX/COROS handoff. No emulation is described as physical testing.

## Verification and release decision

Local checks and CI evidence are recorded with the delivery SHA. Existing tests were retained: baseline 144 web/87 Python/7 PostGIS/10 SQL/222 phone-layout/two local-service cases.

Current local results: **151 unit tests**, **two real local-service tests**, **96 Python tests** (nine PostGIS tests excluded here and run separately), **nine PostGIS tests + ten SQL suites**, lint/types/format/build, non-editable wheel and deployment assertions. Four existing RHF compiler warnings and the Starlette/httpx deprecation remain. Production-mode browser run: **52 passed, 402 skipped** in both projects; this includes all 42 public viewport cases. The existing signed-in 222-case set is preserved, but its authenticated portion cannot be newly claimed as passed without isolated credentials. No tests were deleted or weakened to hide this blocker.

Security review preserves nonce CSP, RLS, encrypted provider vault, service-only worker RPCs, authenticated jobs, four-MiB file admission, retention retries and data rights. New boundary regressions cover invalid service responses, cancellation, export admission, DSN identity, staging refusal, readiness deadlines and read-only privileges. Recheck full/prod dependency audit with the release; the high/critical CI gate remains enabled. Supabase's current TLS notice removes older CBC cipher support on November 10, 2026; include HTTPS/Auth/upload checks on the actual supported devices. Hosted advisors, native DB timezone acceptance and backup restoration remain operator gates.

The code-side hardening is ready for isolated acceptance. **Private beta is not ready** until project/credential isolation, approved routing import, live analytics/jobs, all fifteen service-backed journeys, authorized COROS and required hardware acceptance pass. Remaining blockers require operator access/approval or physical devices; they are not simulated successes.

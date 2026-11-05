# Phase 7 — Staging activation and private beta acceptance

2026-11-05. Observation checkpoint: **06:19:53 UTC**. Branch: `chore/phase7-staging-acceptance`.

**Decision: NO-GO for private beta.** This is a fresh access/preparation pass, not a claim of staging activation. Required infrastructure access, isolated configuration, reference import approval, COROS consent and physical devices are still absent. No infrastructure, provider secret, hosted schema/data or production assignment was changed.

## Source and approval boundaries

Fetched remote main: **`f97324356e324d5dc9d5b8a04d11bfebc36537df`**. Its [CI run 41974058851](https://github.com/xndrncp08/KindaMoving/actions/runs/41974058851) was rechecked and passed web, analytics and database. This already contains the Phase 6 COROS persistence/quota, bounded-download and uncertain-write fixes; they are not new Phase 7 implementation.

Reviewed [Phase 6](PHASE6_BETA_READINESS.md), [deployment](../DEPLOYMENT.md), [requirements](../PRODUCTION_REQUIREMENTS.md), [security](../SECURITY.md), [network import](../NETWORK_IMPORT.md), [routing](../ROUTING.md), [COROS](../COROS_INTEGRATION.md) and [mobile hardware acceptance](../design/MOBILE.md#phase-5-hardware-sign-off-worksheet-all-pending). The [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines) remain the interface requirements. No product/UI or state-management change is needed to resolve the observed access blockers.

Infrastructure changes require explicit approval after the exact target, configuration and costs are reviewable. Import approval is separate. No approval is inferred from access, an unanswered question, a local test or an existing secret. The unrelated whitespace edit in `apps/web/tests/analytics.test.ts` is preserved outside this work.

## Infrastructure and access

| Resource                                 | Phase 7 observation                                                                                                                                                                                                                                                       | Status                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Intended Supabase `yqzbsuandpdlvgtgnwln` | `get_project` again returns permission denied. Connector inventory exposes only an unrelated project in `Diskarte`; neither that organization nor its region is assumed to belong to KindaMoving. The intended organization, region, plan and backups cannot be verified. | **Blocked**                                  |
| Supabase CLI fallback                    | Pinned CLI 2.122.0 `projects list --output-format json` returns `AccessTokenRequiredError`. No access token was requested in chat or retrieved from unrelated resources.                                                                                                  | **Blocked**                                  |
| Isolated staging DB/Auth/Storage         | Not provisioned; no approved organization/region/cost quote, project ref, isolated keys or synthetic accounts available. Existing staging templates and preflight are reusable.                                                                                           | **Prepared; approval/access blocked**        |
| Render management                        | Connector returns no selected workspace. Read-only confirmation requested for `My Workspace`, `tea-d6jjgfhaae7s7397185g`. Known historical service: `srv-dbjjdgdg1s2s73ftupqg`; no fresh service/log/metrics/config inspection without workspace confirmation.            | **Blocked**                                  |
| Render public analytics                  | `https://kindamoving-analytics-staging.onrender.com/healthz` and `/readyz` each time out after a 12-second deadline. Neither returns an HTTP response. This alone does not establish crash, cold start, OOM or invalid credentials.                                       | **Verified probe failure; cause unverified** |
| Vercel                                   | CLI confirms project `prj_WldDezKdgZIpA1ywKpXhiEzWnSaW`, team `team_XeMZUGNnAwo0WYHyGxSx3p71`, root `apps/web`, Node 22 and SSO on all deployments. Project Git link is null.                                                                                             | **Verified configuration reads**             |
| Vercel Preview variables                 | Metadata lists service/cron/encryption/Supabase secrets, analytics/site/Supabase URLs, deployment mode and weather flag. Values were not decrypted or pulled. **`KM_STAGING_SUPABASE_REF` is absent**; names alone do not prove key binding or correct values.            | **Verified configuration gap**               |
| Network reader/TLS                       | Local SQL/reader regressions pass. Hosted role grants, login, certificate verification and native tzdata cannot be accepted without the intended isolated project and reader connection.                                                                                  | **Verified local; blocked hosted**           |

Correct the Supabase connector/account membership for the intended project; the owner must identify the organization before a staging cost quote is requested. The unrelated visible organization is not a fallback. The CLI may be authenticated privately by the operator, but no token belongs in a command argument, report or chat.

The Render skill/connector requires workspace confirmation before reading service state. This is an inspection permission request, not approval to change that workspace's services. No new Render deployment ID or startup diagnosis is claimed. Phase 6's `dep-dbjjdgtg1s2s73fturf0` failure remains dated history.

## Actual deployments and hosted probes

| Deployment                                                                                             | Identifier / source evidence                                                                                                                                | Phase 7 result                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Existing protected preview](https://kindamoving-staging-mlmenszrr-xander-rancaps-projects.vercel.app) | `dpl_7KP4emrBxrTMCX9dxEfEE8VZFqET`, READY, non-production. Phase 5 records committed archive `3c52688`; provider list does not independently echo that SHA. | Platform-authenticated `/api/healthz`: **200**, `{ok:true}`. Anonymous probe: **302** to SSO. This is not a deployment of current main or isolated acceptance. |
| Previous preview                                                                                       | `dpl_8nuNQV1Ho3SJLz5ctew739p3BFvv`, READY. Phase 5 archive evidence `c97215d`.                                                                              | Listed only; no new acceptance against it.                                                                                                                     |
| Render staging origin                                                                                  | `https://kindamoving-analytics-staging.onrender.com`                                                                                                        | Liveness and readiness unavailable within the probe deadline. No successful compute or new deployment verified.                                                |
| Phase 7 isolated candidate                                                                             | No deployment ID or URL exists yet. Reviewed code baseline: `f97324356e324d5dc9d5b8a04d11bfebc36537df`.                                                     | **Not deployed**; blocked by isolation, configuration and infrastructure approval.                                                                             |

Actual Vercel→Render compute, scheduler execution, background-job completion and hosted route generation remain **blocked**. A web liveness response does not close any of these gates. No shared user was signed in or mutated to manufacture a successful probe.

## Prepared infrastructure and secret-manager change plan

The following is the reviewable plan, **not executed configuration**. Fill the owner/region/ref/cost fields from authorized provider reads before requesting a mutation approval.

1. **Provisioning approval:** owner organization, project name (`kindamoving-staging` proposed), region aligned with the approved services, quoted plan/compute/Storage/egress/backup costs and spending limits. Create a fresh project only after approval. Copy no shared users, rows, buckets, OAuth clients or tokens. Record the new ref and approved cost.
2. **Isolation/configuration approval:** review all eleven existing migrations, dry-run using the pinned CLI below, then approve applying them only to the new ref. Verify private `activity-files`, `form-videos`, `form-results` buckets, limits/RLS, Auth Site URL and exact callbacks, SMTP sender, confirmation/recovery and Auth rate limits. Create two run-specific synthetic accounts only in this isolated project; retain their fixture inventory for scoped cleanup.
3. **Render change approval:** after workspace/repository/service identity is verified, review a patch to the existing intended service: non-editable `pip install .`, Python 3.12.15, `0.0.0.0:$PORT`, existing bounded worker/concurrency settings, HTTP health path `/readyz`, auto-deploy off, `KM_DEPLOYMENT=staging`, approved ref, isolated reader DSN and matching service token. Capture the prior settings/deploy for recovery. No plan upgrade is proposed from the timeout evidence. Explicitly approve the patch and reviewed-SHA deploy before applying it.
4. **Vercel Preview change approval:** review only the existing staging project's Preview environment changes and protected preview deployment. Retain SSO on all deployments and production settings. Set the approved isolated ref and URLs, fresh staging-only keys/secrets, then rebuild/deploy a committed reviewed SHA with `scripts/deploy-staging.sh`. Record its real deployment ID and source evidence. Never attach Preview code to shared service-role credentials.
5. **Separate network import approval:** use the exact proposal below after verifying the approved target is empty and backups/recovery are understood. Approval must identify target ref, checksum, no replacement and expected inserts. A restart/cache invalidation, if needed, belongs in the reviewed service action. Do not apply this proposal to the shared project.

Use provider secret interfaces for actual values:

| Destination                     | Values to configure privately                                                                                                                                                                | Isolation check                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Preview                  | `SUPABASE_SECRET_KEY`, public Supabase URL/publishable key, site/analytics URLs, `ANALYTICS_SERVICE_TOKEN`, `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, staging mode/ref, `WEATHER_DISABLED=true` | Match approved ref; fresh staging-only privileged/encryption keys; distinct scheduler/service secrets. Public values require a rebuild. |
| Render service                  | Staging mode/ref, `NETWORK_DATABASE_URL`, `ANALYTICS_SERVICE_TOKEN`, Python/runtime settings                                                                                                 | Reader only; same service token as web. No Supabase service-role key, writer URL or copied environment group containing them.           |
| Supabase Auth                   | SMTP credentials and provider configuration                                                                                                                                                  | Store only in the approved isolated Auth configuration; exact callbacks and operator-owned synthetic mailboxes.                         |
| Private operator import session | `NETWORK_ADMIN_DATABASE_URL`                                                                                                                                                                 | Writer never enters either application deployment or source control.                                                                    |
| Test runner private storage     | Isolated synthetic browser state and credentials                                                                                                                                             | Ignored/private files only; no authenticated trace, exported account, token or signed FIT link in CI artifacts.                         |

Templates: [`config/staging-web.env.example`](../../config/staging-web.env.example) and [`config/staging-analytics.env.example`](../../config/staging-analytics.env.example). Fresh staging encryption keys are appropriate only because the new project contains no existing vault tokens; do not rotate the shared project's key. Secret names being present does not prove correctness. Test service-token equality through authenticated calls, never by printing values.

After approved provisioning, use installed CLI **2.122.0** following `npm ci`, never a global/latest binary with different hosted-targeting semantics:

```sh
./node_modules/.bin/supabase db push --project-ref "$KM_STAGING_SUPABASE_REF" --dry-run --skip-vault
# Applying migrations requires its separate reviewed invocation/approval.
services/analytics/.venv/bin/python scripts/validate-staging.py
services/analytics/.venv/bin/python scripts/check-timezones.py
```

These commands assume values supplied privately in the operator environment. Preflight checks consistency, not ownership, key validity, SMTP, Storage/RLS or provisioning. Do not add `--include-seed`, reset a hosted database or pass passwords/DSNs as command arguments.

Inspect reader grants with the existing [read-only SQL worksheet](../NETWORK_IMPORT.md#operator-only-reader-activation-phase-5), substituting only the approved isolated ref. Expect `km_network_reader`, no superuser/BYPASSRLS/role creation/replication/schema CREATE/inherited roles, SELECT on the three network tables and no writes or user-table reads. Set a generated reader password with the hidden `psql` prompt only after configuration approval; use `sslmode=verify-full`, verified host/username and trusted CA. Confirm actual TLS with `pg_stat_ssl` for the reader's own backend, certificate hostname verification and a rejected wrong-CA/hostname connection. Local test role switching is not hosted TLS evidence.

## Calgary pilot — exact proposed import

Reproduced the archived dry-run in **0.115 seconds locally**; no network download or database write. Archive: `services/analytics/tests/data/calgary_eau_claire.json.gz`, SHA-256 **`bd24ccb18fabf4b864b46ff85eadc7909d6bb7be7499d96502a23803ef465422`**. Source: October 31 OpenStreetMap/Overpass, ODbL 1.0; [fixture provenance](../../services/analytics/tests/data/README.md). No fresh OSM coverage is claimed.

Query bbox: **−114.090, 51.046, −114.055, 51.060**, limited Eau Claire/Prince's Island/Bow River coverage. Complete ways extend outside the query rectangle. This is not a city-wide network.

| Observation                      |            Count |
| -------------------------------- | ---------------: |
| Geometry nodes                   |           10,655 |
| Stored endpoint nodes            |            5,330 |
| Edges                            |            7,483 |
| Traversable edges / endpoints    |    7,429 / 5,315 |
| Traversable components / largest | 34 / 5,181 nodes |
| Dangling edges / invalid lengths |            0 / 0 |
| Default CLI elevation coverage   |               0% |

**Proposed changes only after approval and verified empty target:** insert **5,330 `network_nodes`**, **7,483 `network_edges`**, and **one `network_imports` provenance row** for `calgary`. The importer transaction issues regional deletes/upserts; in a verified empty target those deletes affect zero rows. It must refuse cross-region endpoint collisions and existing-region replacement. No `--replace-existing` is proposed. Current hosted target counts are **unavailable**, not assumed zero.

Before presenting final import approval, read all three target counts and collision checks through the approved target. Stop if the project identity or empty-state assumption differs. Default CLI elevation is absent; terrain-dependent suitability must remain uncertain or blocked until separately reviewed licensed elevation data is available. Local integration tests use the archive's stored Copernicus/Open-Meteo elevations; that does not give the default CLI import elevation coverage or authorize fresh elevation API usage.

Reproduce without credentials using a private temporary JSON containing only the archive's `elements`:

```sh
services/analytics/.venv/bin/python services/analytics/scripts/import_network.py \
  --region calgary --bbox=-114.09,51.046,-114.055,51.06 \
  --from-file reviewed-calgary.json
```

After separately approved application, verify counts/provenance, geometry validity, GiST indexes and crossing/signal attributes on hosted PostGIS; restart only as approved, then run `scripts/accept-routing.py` with private HTTPS/token configuration. It checks real loop/out-and-back/zero-crossing tempo generation plus validation and reports timings, but does not save/export routes. Complete those durable/user workflows separately.

## Fifteen-workflow hosted acceptance matrix

All cases require the approved isolated environment. **None is marked passed from local tests, mocks or HTTP acceptance alone.** Capture initial/final row counts, scoped IDs, job events, server outcomes and cleanup inventory privately. Test A cannot read or mutate B's rows/objects; verify logout/account-switch cache/outbox isolation. Delete only newly created run fixtures.

| #   | Workflow                    | Durable proof required                                                                                                                                                                   | Phase 7 result / blocker                                       |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Authentication/onboarding   | Synthetic signup, mail confirmation/recovery, profile persisted after reload; expired/reused links rejected; two-user isolation and sign-out verified.                                   | **Blocked:** isolated Auth/SMTP/users.                         |
| 2   | GPX/FIT import              | Storage object → owned upload → job/events → terminal `complete`/`duplicate` → activity/streams/splits. Repeat import preserves counts; malformed/oversized files fail honestly.         | **Blocked:** isolation + analytics.                            |
| 3   | COROS OAuth                 | Explicit opted-in account, exact callback/issuer, real exchange and tools list, correct connected owner; no token in API/export/log output.                                              | **Blocked:** isolated origin + account consent.                |
| 4   | COROS synchronization       | Terminal sync job, provider record and imported activity agree; repeat sync/file import deduplicates; quota/resume, refresh/reconnect/disconnect persist correctly.                      | **Blocked:** COROS consent + services.                         |
| 5   | KM Analyze                  | Newly imported durable streams/splits/summary drive rendered metrics and a real Python-backed explanation; reload preserves the activity.                                                | **Blocked:** processed isolated activity.                      |
| 6   | Run comparison              | Two persisted comparable runs, real analytics output with expected units/alignment, honest unsuitable-pair handling and reload/URL state.                                                | **Blocked:** isolated pair + analytics.                        |
| 7   | Route generation            | Hosted network/reader readiness, actual loop/out-and-back/tempo outputs, geographic/distance/workout validity; latency and errors captured.                                              | **Blocked:** reader + approved import + service.               |
| 8   | Route editing/export        | Waypoints snap on the hosted network; saved owned geometry survives reload; exported GPX parses and matches the saved route; B cannot fetch it. Native file handoff recorded separately. | **Blocked:** routing + isolated data; hardware unverified.     |
| 9   | Condition reporting         | Owned report/vote persists; returned community data masks identity; replaying the same `client_id` leaves one server report.                                                             | **Blocked:** isolated DB/users.                                |
| 10  | Condition-aware suitability | A reviewed isolated report intersects the real route corridor; score/avoidance/freshness changes after refetch and recovers after expiry/removal.                                        | **Blocked:** conditions + hosted routing.                      |
| 11  | Training plans              | Generate/apply persists the expected plan/workouts; edits/completion survive reload; reconciliation and invalid-input/ownership failures preserve state.                                 | **Blocked:** isolated DB/users.                                |
| 12  | Gear and mileage            | Assign/unassign/default shoes persist; derived mileage reconciles with imported activities after reload; failed mutation rolls back and B remains unchanged.                             | **Blocked:** isolated DB/imports.                              |
| 13  | Ghost replay                | Real persisted compatible tracks produce alignment; scrub/play/speed and URL restoration work; unsuitable runs fail honestly. Phone gestures verified on hardware separately.            | **Blocked:** isolated tracks + analytics; hardware unverified. |
| 14  | Offline recovery            | IndexedDB queue survives force-close for A, lost-response replay creates exactly one server row, reconnect completes, and B/logout cannot see or send A's queue.                         | **Blocked:** isolated server persistence; hardware unverified. |
| 15  | Account export/deletion     | Export contains owned data and excludes tokens; delete only synthetic A, verify Auth rejection, Storage folders and cascaded rows removed, with B intact.                                | **Blocked:** isolated synthetic identities and Storage.        |

For background processing, correlate `sync_jobs` with `sync_job_events`, owner, upload/provider record and resulting activity. Require terminal durable state, not HTTP 202 or a frontend toast. Exercise one controlled retry and expired lease/cancellation case only in isolation. Establish one approved scheduler; Preview cron configuration and best-effort `after(kickJobs)` do not prove a durable scheduled drain.

## COROS PACE 4 acceptance preparation

Current official [tools](https://github.com/coroslab/COROS-MCP/blob/main/docs/en/tools.md) and [FAQ](https://github.com/coroslab/COROS-MCP/blob/main/docs/en/faq.md) still document the shared 50-file fixed-24-hour retrieval allowance. Watch activities must reach the COROS app/cloud first. No direct watch control or live-device synchronization is claimed.

With explicit account consent: record the regional issuer/callback, complete OAuth, verify capabilities, retrieve one known run's original FIT, and inspect redacted machine structure before trusting normalization. Verify imported durable metrics and duplicate behavior across sync/upload. Check quota reservation/reset/continuation without intentionally exhausting the live allowance. Verify refresh, reauthorization, and disconnect/vault/job cleanup while retaining imports.

For uncertain-write recovery, use an expressly approved disposable route/workout with per-item confirmation. Verify interrupted or incomplete success responses produce `outcome_uncertain` with no automatic scheduler retry; check COROS before another confirmation. Do not create real external writes merely to test failure recovery without that approval. Local regressions cover this contract; live account/device acceptance remains **blocked**.

## Physical devices and mobile acceptance

USB-name inventory enumerated no recognized mobile device. `adb` is unavailable; `xcrun devicectl` reports the utility unavailable. This does not prove the owner lacks a phone; it means no controlled physical-device surface was available here. No tool installation or OS setting change was attempted.

| Surface                                                      | Status         |
| ------------------------------------------------------------ | -------------- |
| Small/large iPhone Safari, portrait/landscape                | **Unverified** |
| Installed iOS Home Screen PWA                                | **Unverified** |
| Small/mid-range and large Android Chrome, portrait/landscape | **Unverified** |
| Installed Android PWA                                        | **Unverified** |

Execute every [existing hardware worksheet](../design/MOBILE.md#phase-5-hardware-sign-off-worksheet-all-pending) case: cold Home/date, safe areas and zoom, keyboards, GPS grant/deny/revoke, cooperative map pan/pinch, sheet interruption, native Back, file cancellation/retry, offline force-close/reconnect/account switch, GPX/COROS handoff, VoiceOver/TalkBack and reduced motion. Record device/OS/browser, deployment SHA/ID, viewport, mode/network and redacted recordings. The historical 222 emulated checks and Phase 6 52 public checks are not new Phase 7 hardware or authenticated acceptance.

## Measurements, verification and costs

| Measurement/check                               | Phase 7 observation                                                                                         | Limit                                                                                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protected preview health                        | HTTP 200, curl transfer **1.938514 s**                                                                      | One platform-authenticated liveness sample; CLI startup excluded; not compute latency, throughput, LCP or a percentile.                             |
| Anonymous preview health                        | HTTP 302, **0.292089 s**                                                                                    | Confirms SSO boundary only.                                                                                                                         |
| Render `/healthz`                               | Client deadline, **12.004495 s**, no response                                                               | Curl `000` is not a server HTTP status.                                                                                                             |
| Render `/readyz`                                | Client deadline, **12.006231 s**, no response                                                               | Does not identify startup cause or resource shortage.                                                                                               |
| Hosted compute/routing, CPU/RAM, quotas/backlog | **Unavailable**                                                                                             | Needs authorized management/metrics and working isolated services. No upgrade recommended from these probes.                                        |
| Local archived import dry-run                   | **0.115 s**                                                                                                 | Local preparation only; not hosted import/query time.                                                                                               |
| Web / Python                                    | **175 web passed** (two live cases skipped); **96 Python passed** (nine PostGIS excluded there)             | Local tests; no isolated hosted persistence claim. Existing Starlette/httpx deprecation warning remains.                                            |
| Disposable PostgreSQL/PostGIS                   | **Ten SQL suites + nine PostGIS tests passed**                                                              | Includes reader rejection/admission, quota, geometry/index/crossing preservation and local route generation/editing. Auth/Storage are test doubles. |
| Packaging/configuration                         | Non-editable analytics wheel, deployment assertions and shell syntax pass                                   | No remote deployment or provider acceptance implied.                                                                                                |
| npm audit                                       | Production: **zero known findings**. Full tree: **zero high/critical, eight moderate** lint-chain findings. | Point-in-time advisory check; no dependency changes.                                                                                                |

Phase 6's synthetic chart profile (118 ms median longest task / 559.5 ms appearance), historical Analyze TBT improvement and Home LCP remain dated lab evidence. No fresh authenticated/hosted performance improvement is claimed. Preserve the same tooling/settings for any future comparison. Do not label emulation as real-device or field performance.

Provider billing/region/limits, SMTP quotas, backup restoration, hosted TLS/tzdata/advisors and scheduler operation remain unverified. Obtain the intended organization's quote and approved budget before provisioning. Existing plan proposals in deployment docs are historical guidance, not a new upgrade recommendation or purchased capacity. Measure successful cold/warm compute and realistic concurrent work on the actual approved service, including memory and job lease/runtime bounds, before selecting an upgrade. Keep optional Form/model disabled until separately measured and configured.

## Remaining operator actions and decision

1. Identify/regain the intended Supabase organization/project access; confirm Render workspace for read-only inspection. Re-run scoped discovery without selecting unrelated resources.
2. Complete the concrete target/region/cost review and obtain provisioning/configuration approvals. Populate only isolated provider secrets; verify reader TLS/grants, Auth/Storage/RLS and native tzdata.
3. Review and approve the bounded pilot import separately against verified empty target counts. Then establish actual Render readiness and protected Preview deployment with recorded IDs/SHAs.
4. Run real Vercel→Render requests, approve/configure the scheduler, verify durable jobs and all fifteen matrix rows with two isolated synthetic users. Record errors/latency/resource samples; clean only run-owned fixtures.
5. Obtain express COROS account/per-item write consent and physical phone access, complete their worksheets, and reassess the gate using actual evidence.

**NO-GO:** protected frontend liveness and passing local/CI checks do not make this platform operational for private beta. No beta invitation, public production promotion, paid upgrade, reference replacement or shared-data mutation is authorized or performed by this report. Activation remains blocked on the specific access/approval/service/device gates above.

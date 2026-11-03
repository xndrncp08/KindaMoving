# Phase 5: mobile performance and private-beta readiness

Date: 2026-11-02. Base: `369ff97`; focused branch: `perf/mobile-beta-readiness`.
No redesign, product module, schema/data migration, paid plan change or public
release is part of this work.

## Evidence labels and release decision

- **Verified:** actual production builds, unit/SQL tests, authenticated service reads
  and deployment-provider observations identified below.
- **Emulated:** Playwright Chromium viewports/touch, mocked GPS, intercepted upload
  and report mutations. These are not physical devices or successful hosted imports.
- **Unverified:** iOS Safari, installed iOS/Android PWA, real keyboards/GPS/pickers,
  pinch/momentum, VoiceOver/TalkBack and real COROS authorization.
- **Blocked:** full hosted workflows requiring the routing reader/writer, Render
  startup secrets, a reviewed approved network import and isolated staging data.

**Private beta is not ready for invitations.** The mobile code is a tested
candidate; shared privileged database credentials, failed analytics startup and
missing hardware sign-off remain release gates. Keep staging protected.

## Implemented changes

- Run analysis mounts off-screen MapLibre and Recharts visualizations when visible,
  once per view. Reserved space and a keyboard-accessible Load button preserve
  scrolling/interaction and support browsers without IntersectionObserver.
- Heart-rate/elevation chart rendering is independently visibility-gated. Pace,
  maps, cursor tracing, summaries and existing calculations remain available.
- A labelled native sample slider uses the existing 44 px design-system Input,
  keyboard arrows and spoken distance/pace values; hovering is no longer required
  to trace an individual sample. No chart series or points were removed.
- Planner sheet stop is validated/restored from `?sheet=peek|half|full`, written with
  history replacement without a server refetch. Cancelled pointer gestures clear
  the temporary transform and retain the last committed stop.
- Existing viewport/phone specs accept private SDK-created synthetic-account state
  and an explicitly selected production server URL. Five focused tests add cold
  date hydration, cooperative map configuration/visibility, chart keyboard access,
  sheet restoration, failed upload retry and persisted offline replay coverage.
  Mutation tests block service workers (which can bypass browser interception),
  abort unspecified writes and intercept all intended writes. Auth state stays in memory and authenticated traces are disabled by default,
  preventing session headers from entering failure artifacts. No test condition
  record was found in the hosted project after testing.
- Network dry-runs now disclose topology/coverage rather than counts alone; invalid
  endpoints/lengths abort before writing. No routing algorithm was changed.
- Staging exports attach the exact Git SHA as deployment metadata and remove their
  temporary archive after upload. No production promotion is added.

## Reproducible authenticated cold-client lab

Production `next build`/`next start`, dedicated `127.0.0.1:3015`, Apple M4/macOS,
Node 22.23.4, pinned Lighthouse 12.8.2 and Playwright Chromium. Before `369ff97`,
after `c80eea7`. Same synthetic account's 18 imported Calgary-loop runs and same
analysis record. Each trial starts a new browser, no HTTP cache, service worker,
IndexedDB or local storage. Only SDK-issued Auth cookies and (in remembered cases)
zone/locale cookies are retained. No password reset or mail delivery was required.
The harness asserts the same authenticated identity before/after, correct final
path, no page/hydration errors and no development chunks.

**Applied DevTools throttling**, not simulated scoring: CPU 4×, request latency
150 ms, download 1638.4 Kbps, upload 675 Kbps; 393×852, DPR 1, mobile UA. The harness
records protocol commands and rejects trials without observed CPU/network
throttling. Three trials/case/build, median below. The server/Supabase path is warm
and not subject to browser network throttling. These are local **lab** data,
not field INP, low-end-device timing or hosted cold-server latency.

| Case                                 | Before LCP | After LCP | Before TBT | After TBT | Perf before → after | CLS before / after |
| ------------------------------------ | ---------- | --------- | ---------- | --------- | ------------------- | ------------------ |
| Home, first locale visit             | 2.664 s    | 2.678 s   | 37 ms      | 41 ms     | 96 → 96             | 0.047 / 0.047      |
| Home, remembered locale, cold assets | 0.803 s    | 0.785 s   | 28 ms      | 33 ms     | 100 → 100           | 0.054 / 0.054      |
| Analyze                              | 0.770 s    | 0.778 s   | 622 ms     | 37 ms     | 84 → 100            | 0.00045 / 0.00045  |

All 18 valid trials: zero hydration errors, accessibility score 100. Analyze TBT
trials were 854/622/585 ms before and 37/37/34 ms after. Home differences are lab
noise; no Home speedup is claimed. The existing hydration fix holds on first and
remembered visits. First locale visit intentionally waits for the device date;
that leaves about 2 s versus remembered SSR and remains a measured limitation.
Never choose a server timezone simply to eliminate the correct-date fallback.

The old 4.37 s Home/470 ms Analyze audit figures use a different dataset/run and
are not the before column. An accidental run against an existing development
server on port 3000 was rejected after development bundles were detected. No
numbers from that run are used here; the user's server was left running.

Profiling the baseline's middle Analyze trial: 1,741 ms script evaluation,
329 ms style/layout, 149 ms parse/compile. The React/Next runtime chunk accounted
for 1,431 ms total (1,155 ms scripting); this includes work caused by rendering the
charts and must not be mislabelled as a Recharts download. After the change, the
middle trial records 821 ms script evaluation, 95 ms style/layout and 65 ms parsing. MapLibre's 1.10 MB
uncompressed chunk accounted for 462 ms total (382 ms scripting, 62 ms parse).
In the optimized initial viewport those secondary visualizations are absent;
they still initialize on scrolling or pressing Load. Deferral shifts some work to
first reveal; it does not make the map engine intrinsically cheap.

A **separate** Puppeteer navigation (393×852, DPR 1, applied 4× CPU/4G, no
Lighthouse/axe scrolling) checked first reveal after client hydration. Both widgets
were initially unmounted. Map-canvas creation took **487 ms**, with 90/51/65 ms
long tasks; chart appearance took **1,370 ms**, with 150/79 ms tasks. This single
sample includes chunk/network/render work; resources may already be fetched at
mount. Canvas creation is not completed tile rendering. It is not INP or physical
input latency. A 150 ms first-chart task remains a low-end-phone risk to validate,
not evidence that all interaction is instant. Earlier post-Lighthouse interaction
samples failed viewport validation and were excluded; the cold navigation series
above uses Lighthouse's own applied screen/throttle settings.

**Tooling security follow-up:** the recorded comparison above used Lighthouse
12.8.2 / Puppeteer 24.43.1. A final full development audit identified high
advisories in that tooling, so the maintained harness now pins **Lighthouse
13.5.0 / Puppeteer 25.16.0**, requiring Node >=22.19. This removes the introduced
high findings without changing runtime dependencies or relabelling historical
numbers. Current audit: **0 high/critical**, 16 existing moderate lint-chain
findings; production dependencies: **0 known vulnerabilities**. CI now rejects
high/critical advisories across the full dependency tree. No forced ESLint/Next
downgrade or broad override was used. Lighthouse 13.6.0 was reviewed but adds
moderate glob/Sentry advisories; 13.5.0 with patched Puppeteer avoids them.

The current-toolchain cold-load and reveal compatibility probes pass; these are
not substituted into the 12.8.2 comparison. Use one identical current toolchain
on both revisions for a new comparison. Audit versions affect scores and tracing,
so cross-version numbers must not be presented as an optimization gain.

Sanitized per-trial numbers/settings: [phase5-lab.json](phase5-lab.json).
Private raw traces/LHR can contain session data and stay ignored in `output/`;
never upload them or Playwright Auth state as CI artifacts.

Reproduce with an isolated synthetic fixture, private `KM_E2E_STATE`, and its
imported `KM_LAB_RUN` (IDs/credentials are deliberately absent here):

```sh
# In a separate clean checkout, build and start on an unused port.
npm ci
npm run build
npm run start -w @km/web -- --port 3015
# From the checkout being measured, in another terminal:
KM_LAB_URL=http://127.0.0.1:3015 KM_LAB_RUNS=3 \
  KM_LAB_OUT=output/phase5/lab node apps/web/scripts/mobile-lab.mjs
# Separate post-navigation widget profile; same private state/run, not Lighthouse/INP:
KM_LAB_URL=http://127.0.0.1:3015 KM_LAB_OUT=output/phase5/reveal \
  node apps/web/scripts/mobile-reveal.mjs
```

## Tests, accessibility and physical devices

Local verification on the optimized production build:

| Check                                                | Result                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Preserved viewport audit, 15 pages × 14 sizes        | **210 passed**                                             |
| Preserved seven phone flows + five new focused cases | **12 passed**                                              |
| Vitest                                               | **144 passed**, 2 live-service cases skipped               |
| Python standalone                                    | **87 passed**, 7 PostGIS cases skipped here                |
| Disposable PostgreSQL/PostGIS                        | **10 SQL suites + all 7 network integration cases passed** |
| Lint / TypeScript / production build                 | Passed; 4 existing RHF compiler warnings                   |
| Deployment assertions / shell syntax                 | Passed                                                     |

The two normally skipped Vitest live-service cases also passed separately against
a disposable local FastAPI process, synthetic FIT fixture and ephemeral service
token, without database credentials. They are not hosted verification. Public/security
browser checks also passed in CI at `c80eea7` (web/analytics/database),
[run 41573404978](https://github.com/xndrncp08/KindaMoving/actions/runs/41573404978).
Production dependency audit: zero known vulnerabilities. Final commit/CI/deployment
evidence follows below.
The combined final run passed **222/222** (the original 210 viewport cases,
seven preserved phone interactions and five focused additions). Date hydration
also passes with the browser deliberately one calendar day ahead of the server.
The original cases remain intact.
A deterministic blank map style isolates the new interaction tests from changing
tiles; the chart-control screenshot is a focused macOS Chromium baseline, not a
whole-page or cross-platform pixel guarantee. Regenerate a platform baseline
only after review, never to silence a defect. Full matrix captures remain ignored.

The audit caught a newly added 16 px native slider target in all 14 sizes. Reusing
the house Input corrected it to 44 px. Keyboard focus and spoken values are
verified in emulation/unit tests. Lighthouse's 100 accessibility score is an
automated subset, not WCAG certification or a screen-reader audit.

No accessible physical phone was enumerated in USB inventory (`adb` unavailable; Apple device-control tooling
not installed). No hardware result is claimed. The precise acceptance matrix in
[MOBILE.md](../design/MOBILE.md#phase-5-hardware-sign-off-worksheet-all-pending)
covers Safari/Chrome and both installed PWAs, small/large phones, orientations,
insets/chrome, keyboard, GPS denial/revocation, real file pickers, pan/pinch,
sheet momentum/cancellation, Back, persistent offline queue, GPX/COROS handoff and
VoiceOver/TalkBack. Every hardware cell is **pending**.

## Protected staging and hosted integration evidence

Confirmed intended Supabase project: **`yqzbsuandpdlvgtgnwln`**. Both local config
and Vercel Preview public config agree. Management project lookup and read-only
SQL were denied for this exact project. No alternative project was changed.
Scoped existing application credentials allowed Auth and data reads only.

**Updated protected candidate:**
[Phase 5 staging](https://kindamoving-staging-q8frkjayp-xander-rancaps-projects.vercel.app),
`dpl_8nuNQV1Ho3SJLz5ctew739p3BFvv`, **READY / preview**. Deployed from the
committed `c97215d` archive with the versioned staging config; no production
promotion. `--meta kmGitSha` was submitted, but the available provider/CLI inspect
responses do not expose it, so the SHA evidence is the local archive/deploy
command and CI rather than a claimed provider metadata echo. The build ran Node
22 (the app engine overrides the project's configured default).

After deployment, provider configuration still reports SSO on **all** deployments.
An unauthenticated request with redirects disabled returns **302 to vercel.com**;
following that SSO redirect produces a login page with HTTP 200, not public app
access. Authenticated `vercel curl /api/healthz` returns **200 / `{"ok":true}`**.
An origin-scoped OIDC browser check using only the synthetic account verified
Home, Analyze keyboard tracing, planner `?sheet=full` and Conditions, with **zero
page errors**. The real versioned MapLibre worker and OpenFreeMap style returned
200, and the staged screenshot shows the synthetic route rendered over real map
tiles. No map/mock responses were substituted in this hosted check. It is
**Chromium emulation**, not hardware or completion of all fifteen workflows.
The first worker probe used an exact filename match and missed its version query;
matching the actual versioned URL corrected the probe, with no app change.

Implementation `c97215d` passed all three GitHub jobs (web, analytics, database) in
[run 41576172096](https://github.com/xndrncp08/KindaMoving/actions/runs/41576172096).
The later evidence update changes documentation only. Main remains subject to the
same CI checks; the merge SHA/run are reported in the delivery summary.

Prior preview: `dpl_DiT2QbtcMchn6zzNuF59U5hrxyS3`,
[protected staging](https://kindamoving-staging-23t2vhmrd-xander-rancaps-projects.vercel.app),
project `kindamoving-staging` / `prj_WldDezKdgZIpA1ywKpXhiEzWnSaW`.
Provider reports READY, preview target, SSO on **all** deployments. Authenticated
`vercel curl` returned `/api/healthz` 200. Original CLI deployment has no Git SHA
metadata; no source SHA is inferred from READY.

Authenticated synthetic-account reads returned 200: profile, 18 activities,
summary with explicit week, streams, 18 splits, analytics overview, training
window, gear analytics, nearby conditions and COROS connection state. Early probes
without required date/location parameters returned 400 correctly; corrected
queries passed. These are real Supabase-backed reads, not proof of write flows or
Python analytics. Locally available cron credential returned 401 on staged
`/api/readyz`; Preview secret values cannot be pulled (placeholders only). No
secret was replaced merely to obtain a passing probe. A real staged Python-backed
explanation request returned **503** after about 19 s. Account export returned
**200**, 19 tables / 3,157,477 bytes with no private token keys. The first export
probe exceeded the local child-process stdout buffer; streaming to a private file
resolved the probe failure without an application change. Account deletion was
not attempted.

Render `kindamoving-analytics-staging`, `srv-dbjjdgdg1s2s73ftupqg`,
[service origin](https://kindamoving-analytics-staging.onrender.com): **free**
compute, empty provider health-check path, latest deployment
`dep-dbjjdgtg1s2s73fturf0` **update_failed**, SHA `b8392408...`.
Actual logs show startup validation rejecting the service token and missing
`km_network_reader` + `sslmode=verify-full` URL. Direct health/readiness probes each
timed out at 65 s. This is a failed configured deployment, not a passing cold start.
No service plan, environment secret, database role or hosted reference data was changed.

Hobby permits daily cron only, and preview cron configuration does not prove jobs
are running: [Vercel limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
Render free sleeps after 15 idle minutes, may take about a minute to wake, and has
workspace free-hour limits: [Render limits](https://render.com/docs/free).
Minute queue drain, 15-minute conditions and sustained analytics remain operational
gates. Existing Pro/always-on topology is guidance, not a purchased plan or
capacity result. No keep-alive workaround or duplicate scheduler was introduced.

## Calgary reference-network dry-run (no writes)

A fresh Overpass request failed (HTTP error); no fresh-source coverage is claimed.
Used the repository's licensed **2026-10-31 archived Eau Claire fixture** instead:
`services/analytics/tests/data/calgary_eau_claire.json.gz`, SHA-256
`bd24ccb18fabf4b864b46ff85eadc7909d6bb7be7499d96502a23803ef465422`.
Query bbox **−114.090, 51.046, −114.055, 51.060** (~Eau Claire/Prince's Island/Bow
pathway), not downtown/whole-city coverage. Complete OSM ways extend beyond the
query rectangle to −114.1019621, 51.0443844, −114.0517097, 51.0667054.

| Dry-run observation                  | Count                           |
| ------------------------------------ | ------------------------------- |
| Source nodes / ways                  | 10,891 / 3,562                  |
| Graph geometry nodes / total edges   | 10,655 / 7,483                  |
| Stored edge-endpoint nodes           | 5,330                           |
| Traversable edges / endpoint nodes   | 7,429 / 5,315                   |
| Traversable components / largest     | 34 / 5,181 nodes                |
| Dangling endpoints / invalid lengths | 0 / 0                           |
| Elevation coverage in this CLI run   | 0% (optional fetching disabled) |

Largest component contains 97.5% of traversable endpoint nodes; disconnected
pieces remain. This validates references/positive lengths, not all route quality,
accessibility or city coverage. Archived fixture includes elevation separately,
but the default import does not silently consume it. OSM ODbL/Copernicus attribution
remains in the fixture README. Future elevation fetches require quota/license review.

Read-only REST counts on intended hosted project: `network_nodes=0`,
`network_edges=0`, `network_imports=0`. A separately approved application of this
extract would insert 5,330 endpoint nodes, 7,483 edges and one provenance row;
**proposed only**, not applied. Writer DSN, backups, reader/tzdata acceptance and
explicit import approval are absent. No replacement is proposed or authorized.

```sh
# Extract only the fixture's `elements` into reviewed JSON, preserving provenance/checksum.
services/analytics/.venv/bin/python services/analytics/scripts/import_network.py \
  --region calgary --bbox=-114.09,51.046,-114.055,51.06 \
  --from-file reviewed-calgary.json
```

Exact safe operator inspection/password/login instructions:
[NETWORK_IMPORT.md](../NETWORK_IMPORT.md#operator-only-reader-activation-phase-5).
Do not paste passwords/DSNs into SQL files, command arguments, logs or handoffs.

## Fifteen-workflow acceptance (current run)

Earlier Phase 2 acceptance in TESTING.md is historical and is not reused as a
current full-staging pass. No destructive journey ran against the shared project.

| #   | Journey                       | Current evidence / remaining gate                                                                                                                                                             |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Register/onboard/authenticate | Existing synthetic SDK session + staged profile reads verified; new signup, mail/recovery and onboarding writes pending isolated staging.                                                     |
| 2   | GPX/FIT import                | Validation/unit tests and emulated 503→retry pass; processed hosted success/dedup blocked by failed analytics startup.                                                                        |
| 3   | COROS authorization           | Blocked: no expressly authorized real account. State UI/read only.                                                                                                                            |
| 4   | COROS synchronization         | Blocked by account, secrets and backend; not simulated as success.                                                                                                                            |
| 5   | Run analysis                  | Real staged streams/splits and summaries read; local production charts/map/keyboard verified in emulation. Staged Python explanation returned 503; its successful acceptance remains blocked. |
| 6   | Compare runs                  | Layout/emulated selection coverage retained; hosted Python comparison pending.                                                                                                                |
| 7   | Generate route                | Blocked: zero hosted network, no reader/writer acceptance or approved import.                                                                                                                 |
| 8   | Edit/save/export GPX route    | Layout/unit contracts retained; hosted saved-route journey and native GPX handoff pending routing + hardware.                                                                                 |
| 9   | Report condition              | Staged nearby read passes; writes/retry intercepted, no shared public test report. Real server write acceptance pending isolation.                                                            |
| 10  | Condition → route suitability | Blocked by hosted routing data/backend; disposable PostGIS tests remain the alternative.                                                                                                      |
| 11  | Training                      | Staged calendar/pace read passes; apply/edit/completion writes pending isolation.                                                                                                             |
| 12  | Gear/shoe assignment          | Staged analytics reads + existing assignment unit/SQL contracts; full hosted mutations pending isolation.                                                                                     |
| 13  | Ghost                         | Layout/interaction fixtures retained; hosted analytics/replay service and real-device acceptance pending.                                                                                     |
| 14  | Offline recovery              | Browser IndexedDB reload/replay with intercepted requests and existing unit tests; airplane-mode/force-close/server dedup hardware journey pending.                                           |
| 15  | Account export/delete         | Staged synthetic account export passed (19 tables; no private token keys). Do not delete shared fixture/user data; deletion requires isolated project.                                        |

## Exact operator / Claude handoff

1. Regain scoped administration for the confirmed Supabase project. Inspect reader
   privileges using the linked instructions, set a generated password privately,
   enable only that login, and verify TLS and native historical/current tzdata.
   Never substitute a different accessible project or an admin DSN on Render.
2. Supply the matching Vercel/Render service token and reader URL via secret
   interfaces; configure `/readyz`, deploy the reviewed backend SHA, inspect logs
   and test real Vercel→analytics readiness. Obtain the actual scheduler credential
   for authenticated smoke without printing it. Do not rotate encryption keys.
3. Review the pilot's limited coverage/topology, obtain the writer connection,
   backups and **separate explicit import authorization**. Run a fresh-source
   dry-run if required; no apply/replace is authorized by this report. Restart
   analytics after an approved import and verify actual generated/snap/export routes.
4. Isolate staging Auth/database/Storage and privileged credentials before invites
   or destructive testing. Review SMTP/callbacks/rate limits, job cadence, provider
   quotas, budgets and uptime. Paid-plan changes need operator approval.
5. Execute all fifteen workflows with isolated synthetic identities and real
   services. COROS needs an explicitly opted-in account; validate processing/job
   completion, not just HTTP acceptance. Keep deletions confined to isolated data.
6. Complete every hardware worksheet cell, including first chart/map reveal on a
   mid-range Android, iOS PWA keyboard/Back/files and persistent offline recovery.
   Attach device/OS/network versions and recordings, then reassess beta readiness.
7. Extend the existing Query/Zustand/forms/SSR/MapLibre/Python boundaries. No new
   modules or redesign are needed to finish these gates. Collect field performance
   only after a properly isolated, consented beta; lab scores do not replace it.

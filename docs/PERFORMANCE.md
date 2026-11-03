# Performance measurements

All numbers were measured in this repository on **2026-10-31**: Apple M4, macOS, Python 3.12.15, Node 22.23, single process, warm caches, median of 3 runs. Scripts are reproducible from `services/analytics` (graph extract via `scripts/import_network.py` / Overpass).

## Route generation: profiled and optimized

Workload: downtown Calgary OpenStreetMap extract, bbox −114.13, 51.035, −114.03, 51.070: **63,483 nodes, 44,893 edges**. Start at Eau Claire (51.0532, −114.0727).

Profiling (cProfile) showed 6.0 s of 8.9 s (profiled) in point-to-point `route_between`, which ran a Dijkstra over the entire graph to find one path. The fix stops the search once the target is settled; the result is identical because settled distances and predecessors are final.

| Request                                    | Before | After      | Speed-up | Output                      |
| ------------------------------------------ | ------ | ---------- | -------- | --------------------------- |
| 10 km loop, 4 km zero-crossing tempo, flat | 3.57 s | **1.57 s** | 2.3×     | identical (best 10,492.5 m) |
| 8 km loop                                  | 2.97 s | **1.16 s** | 2.6×     | identical (best 8,051.3 m)  |
| 6 km out-and-back                          | 0.10 s | 0.10 s     | —        | identical                   |

Graph build from Overpass JSON: 0.22 s for the same extract. In production the graph is loaded from PostGIS through the GiST bbox index and cached per ~2 km tile (6 tiles LRU), so repeated requests near a start skip the load.

## Activity processing and analytics

| Workload                                                          | Median  |
| ----------------------------------------------------------------- | ------- |
| Parse + clean + metrics, 6 h FIT at 1 Hz (21,601 samples, 497 kB) | 0.763 s |
| Parse + clean + metrics, 2 h GPX at 1 Hz (7,201 samples, 1.7 MB)  | 0.154 s |
| Ghost alignment, 20 km loop (6,667 vs 6,897 samples)              | 0.242 s |
| "Why different?" against 60 candidates with 400-point tracks      | 0.049 s |

A throughput regression test (`test_large_activity_throughput`) fails if the 6 h FIT exceeds 15 s.

## Database

- Comparable-run candidates come from one SQL function with `st_simplify` (~10 m), so the analytics payload stays bounded (2,001-point tracks → < 50 points, asserted in `phase2_analytics.sql`).
- Gear and summary totals are SQL aggregates, so there are no N+1 queries and no stored counters to repair.
- Indexes added for every new foreign key and access path (owner/date, GiST on tracks, network geometry and condition locations, partial indexes for ready jobs and active reports).

## Client

| Measure                                                  | Value                  |
| -------------------------------------------------------- | ---------------------- |
| Shared root JavaScript (all pages)                       | 432 KiB uncompressed   |
| MapLibre chunk (lazy: route/ghost/conditions maps only)  | 1,053 KB (285 KB gzip) |
| Recharts chunk (lazy: activity, analytics, ghost charts) | 347 KB                 |

Maps and charts are `next/dynamic` imports with `ssr: false`, absent from the marketing and dashboard paths. Map sources are updated in place (one MapLibre instance per view), so replay frames and form edits never re-create the map. Charts are thinned to ≤ 600 points; streams are stored at ≤ 20,001 points.

## Not measured (and not claimed)

End-to-end API latency on hosted infrastructure, PostGIS network load time on Supabase, real-device mobile rendering, and MediaPipe throughput on real footage.

## Phase 3 deployment tradeoffs (not new performance measurements)

Nonce CSP moves HTML, including marketing, to dynamic rendering; public metadata/static assets remain cacheable. Do not cache nonce HTML independently from its matching CSP response. No new latency/throughput improvement is claimed. Maps/charts remain lazy, stores/query responsibilities are unchanged, and no routing/analytics algorithm was replaced.

The selected Render starter compute has 512 MB RAM and one worker/concurrency two. The existing six-graph cache and optional video processing can exceed this on larger networks/media; load-test the approved Calgary pilot on the actual service and set a measured capacity plan before whole-city or Form use. Free cold starts are excluded from the proposed production topology. Monitor in-flight job duration against the 300-second Vercel limit and 240-second lease. Manual upload ingress is 4 MiB to fit Vercel's request limit; direct video and server-to-server COROS flows retain their existing limits.

## Phase 5 mobile lab (2026-11-02)

Authenticated cold-client measurement is now reproducible and rejects development
builds, broken sessions and unapplied throttling. Three trials/case/build on the
same M4, real applied 4× CPU and 150 ms / 1638.4 Kbps browser network: Home first
locale visit LCP 2.678 s (no hydration errors), remembered-locale cold-assets LCP
0.785 s; Analyze TBT 622 → 37 ms median, LCP 0.770 → 0.778 s. The improvement comes
from visibility-based initialization of secondary maps/charts, preserving their
functions and existing bounded series. It does not eliminate first-use engine
cost or establish physical-phone/field INP. Home differences are noise and its
first locale visit remains hydration-dependent.

Method, all sanitized trials, first-reveal cost, checks and hardware limitations:
[Phase 5 report](release/PHASE5_MOBILE_READINESS.md). The previous mobile audit's
pre-hydration Home result is historical; it is not the baseline for these numbers.

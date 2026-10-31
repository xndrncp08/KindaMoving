# KM Ghost: virtual competition

Race a previous run on the same route. The replay is a **simulation of two recorded runs**. It is never presented as live device tracking, and COROS offers no live GPS stream.

## Pipeline (`services/analytics/km_analytics/ghost.py`, `POST /v1/ghost/align`)

1. **Inputs**: the processed streams of both runs (owner-checked by `GET /api/ghost?a=&b=`). Run _a_ is the reference ("you") and _b_ the ghost.
2. **Comparability gate**: each track must lie within 40 m of the other for ≥ 80 % of its length (sampled every 25 m, both directions), and processed distances must agree within ±15 %. Otherwise the response is `not_comparable` with the reasons, and the UI offers the distance-aligned comparison instead.
3. **Reference arc**: geometry decides where a point projects, while arc length is the reference run's processed (jitter-filtered) distance. Raw GPS polylines overstate length under noise (+41 % in the noisy test fixture), so they are not used for distance.
4. **Map matching**: each ghost sample is projected onto the reference within an arc window `[s − 30 m, s + 300 m]` around its last match. Progress is forced monotonic, so loops and out-and-backs cannot make the ghost jump to the other leg. Samples > 60 m from the route are unmatched (position held) and reported as off-route spans (≥ 10 s).
5. **Gap**: the first time each runner reaches arc length _s_, every 25 m, gives `gap(s) = t_ghost(s) − t_reference(s)` (positive: you were ahead). The gap is sampled by position, so it is immune to the two devices' distance discrepancies.
6. **Splits**: per reference kilometre, both runners' times and the difference.
7. **Replay frames** every 5 s place both runners on the reference line by their aligned progress. Playback (Zustand) interpolates between frames client-side with `requestAnimationFrame` at 10–120×.

## Verified (`tests/test_ghost.py`)

- Constant 5 % pace difference: the gap at 3 km is 52.6 s ± 4 (analytic), with 1 km split deltas ≈ 17.5 s.
- Out-and-back with GPS noise: |gap| < 3 s everywhere except at the turnaround apex. There both legs coincide, so position is inherently ambiguous within the GPS noise (one 25 m grid point, ~10 s in the test). A naive nearest-point matcher would be off by ~667 s on the whole return leg.
- Different routes and much shorter runs are refused with explanations; a detour is reported, not matched; output is deterministic.

## Limits

- Only runs with GPS streams (file import or COROS) can be ghosted.
- Ambiguity at turnarounds and at points where a route crosses itself, within the GPS noise.
- One ghost at a time.

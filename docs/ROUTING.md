# KM Routes: workout-aware routing

## Data

- **Network**: OpenStreetMap ways (© OpenStreetMap contributors, **ODbL 1.0**), imported per region by `services/analytics/scripts/import_network.py` from the Overpass API (identifying User-Agent, bounded bbox). Large regions should be imported in tiles or from a Geofabrik extract.
- **Elevation** (optional): Copernicus DEM GLO-90 via the Open-Meteo elevation API (CC BY 4.0, free tier non-commercial). The importer **aborts** if any elevation chunk fails, because a partially elevated network would make climb metrics silently wrong. Without elevation, route reasons say "Elevation was not assessed" and never claim "0 m climb".
- **PostGIS**: `network_nodes`, `network_edges` (GiST on `geom`), `network_imports` (provenance and license per import). RLS is enabled with no browser access. The routing service reads through `km_network_reader` (select-only on those tables).

```sh
# operator, once per region (admin connection string)
services/analytics/.venv/bin/python services/analytics/scripts/import_network.py \
  --region calgary --bbox -114.13,51.035,-114.03,51.070 --elevation open-meteo \
  --database-url "$NETWORK_ADMIN_DATABASE_URL"
# then give the routing service a read-only login
alter role km_network_reader with login password '<generated>';   -- NETWORK_DATABASE_URL uses this role
```

## Graph model

OSM ways are split at every node shared with another way. Each edge stores length (ellipsoidal), highway class, name, surface, lighting, traversability (foot access) and per-direction climb from node elevations. Trunk roads are stored only as _non-traversable_ edges so that crossing them can be detected. Driveways and parking aisles are not "streets" for crossing purposes.

**Crossing semantics.** Passing node _v_ from edge _a_ to edge _b_ crosses every other road meeting at _v_, at the highest class among them (major = trunk/primary/secondary/tertiary; minor = residential/unclassified/living street/service). Exceptions: a turnaround crosses nothing, and going straight along one way does not cross that way. OSM has no reliable sidewalk side, so turns are counted **conservatively**: a right turn that crosses nothing still counts. "No crossings" is therefore a guarantee, not an estimate. `crossing=traffic_signals` marks a crossing as signalised.

## Generation

1. **Costs.** An edge costs `length × (1 + preference)`, where preference covers path type (footway 0 … primary 1.2, steps 2), surface mismatch, unlit (if lighting preferred) and `4 × hazard weight`. On top of that: climb × 12 (flat preference), or a bounded bonus (hills welcome). Each step adds a crossing penalty (minor 60 m, major 250 m, signals +150 m), and re-used edges cost 4×.
2. **Tempo section.** Seeds are nodes within `(D(1+tol) − T)/2` of the start, ranked by closeness blended with their longest incident edge so pathway nodes are tried, and thinned to one per 200 m cell (max 60). From each seed, Dijkstra runs in the subgraph where forbidden crossings are impossible (major unless allowed; minor too when the limit is 0; otherwise minor crossings carry a 300 m penalty). End nodes are where the path first reaches `T(1−10 %)` while the previous node was within `T(1+10 %)`, so a tempo may end mid-edge on long junction-free pathways. Shortfall below _T_ is penalised in ranking. Up to 12 segments are kept after de-duplication (Jaccard < 0.6).
3. **Assembly.** Approach start→seed, then the tempo, then the return end→start with re-use penalised. If the total is short, the approach is lengthened through a via-point _w_ minimising |d(start,w) + d(w,seed) − needed|, from two shortest-path trees (the ellipse method). Totals outside `D ± tol` are rejected. Tempo crossings are then **counted exactly** on the assembled route (open interval: crossings at the tempo's first and last node are outside the effort), and any violation is discarded.
4. **Plain loops.** For each of 8 bearings, a triangle through via-points at `D/(3·1.3)`, rescaled up to 4 times until within tolerance. **Out-and-back:** turnarounds at network distance ≈ D/2.
5. **Score** (lower is better; every component is returned):

| Component  | Formula                                         |
| ---------- | ----------------------------------------------- |
| distance   | 4 × \|L − D\| / D / tolerance                   |
| crossings  | 0.6 × major + 0.15 × minor + 0.3 × signalised   |
| busy_roads | 1.5 × fraction beside major roads               |
| overlap    | 1.5 × repeated fraction                         |
| hazards    | 3 × Σ hazard weights touched                    |
| climb      | flat: 0.05 × m/km; hilly: −0.03 × min(m/km, 40) |
| tempo      | 3 × major + 1 × minor + 0.1 × tempo climb m/km  |
| surface    | 2 × (1 − matching fraction)                     |
| lighting   | 1.5 × unlit fraction (0.5 if unknown)           |

6. **De-duplication.** A candidate is dropped when its edge-set Jaccard similarity with a better one is ≥ 0.75. Up to `max_results` remain.
7. **Explanations.** Distance error, tempo location (way names), crossings, climb (or "not assessed"), path share, repeats, lighting coverage and condition warnings.

## Conflicts

When nothing fits, the response lists _which_ constraint failed and why, with concrete alternatives:

- no uninterrupted stretch of the tempo length within reach → the longest one found, "shorten to X km", "allow one signalised major crossing", "split into N blocks", "start nearer a pathway";
- stretches exist but the round trip is too long → the minimum achievable distance;
- start more than 400 m from any mapped way.

Generation never connects disconnected ways. Every coordinate pair of every output lies on a mapped edge (asserted in `tests/test_routing.py::assert_on_network`).

## Editing, validation, export

- **Editing**: ordered waypoints snap to the nearest mapped node (≤ 250 m), and each leg is the preferred shortest path. A leg with no mapped connection is reported, not drawn. On the client, snap results are keyed by the waypoint list (TanStack Query) and superseded requests are aborted, so out-of-order responses cannot win. The unsaved-changes guard protects edits.
- **Validation** (`/v1/routes/validate`): samples every 20 m. Sections > 25 m from any way for ≥ 60 m are `off_network`, and vertex jumps > 200 m are `jump`. Coverage, distance and loop closure are reported.
- **Storage**: `save_route` (definer, owner pinned to `auth.uid()`) validates GeoJSON in PostGIS (type, 2–20,000 points, validity, bounds) and derives `distance_m` geodesically. Clients cannot write geometry columns or change a mapped route's distance.
- **GPX 1.1 export** with ODbL attribution in metadata. **COROS**: the documented `uploadRouteFile` tool (routeType 2) after an explicit confirmation dialog. The job is never retried blindly. "Accepted" means submitted for processing, and the route appears in the COROS app within minutes. Manual import instructions are shown alongside.

## Verified behaviour

- Synthetic city (`tests/test_routing.py`, 10 tests): tolerance, loop closure, on-network output, the tempo uses the only crossing-free path, conflict explanations, island and far-start refusal, hazard handling, out-and-back, determinism.
- Real Calgary data in PostGIS (`tests/test_network_db.py`, run via `scripts/test-database.py --then …`): store → GiST-indexed load round trip, a 6 km route with a 2 km zero-crossing tempo along the Bow River pathway with elevation assessed, invented river crossing flagged, waypoint editing on-network.
- Ad-hoc run on a 45k-edge downtown Calgary extract with the brief's example (10 km, 4 km uninterrupted tempo, flat, no crossings in the fast part): loops of 10.0–10.1 km whose tempo runs along the Bow River Pathway / George C. King Bridge with 0 major and 0 minor crossings, in 3.7 s. See [PERFORMANCE.md](PERFORMANCE.md).

# Running metrics and formulas

Every metric is deterministic: the same file always yields the same numbers. Implementations live in `services/analytics/km_analytics/` and are covered by `tests/test_processing.py`. Units: metres, seconds, bpm, steps/min.

## Distance

- **Geodesy.** Consecutive fixes use a tangent-plane distance on the WGS84 ellipsoid with the meridional radius _M_ and the prime-vertical radius _N_ at the mean latitude: `d = √((Δφ·M)² + (Δλ·N·cos φ)²)`. Relative error is ~(d/R)², which is below 10⁻⁹ at GPS sample spacing. It is checked against Vincenty's inverse formula (`vincenty_m`), which reproduces the Flinders Peak–Buninyong reference line to 1 mm.
- **Jitter suppression.** A segment counts only when the windowed speed shows movement. Windowed speed is the distance between the centroid of fixes in `[t−5 s, t]` and the centroid of fixes in `[t, t+5 s]`, divided by the difference in mean times. Averaging reduces independent noise by about √n. Threshold: 0.5 m/s.
- **Outliers.** A fix implying more than the sport's maximum speed (12.5 m/s for running) from the last accepted fix is rejected, unless the next 3 fixes agree with it (signal re-acquisition).
- **Device distance** (FIT `record.distance`) is used when ≥ 90 % of samples have it, it is monotonic, and it agrees with GPS within 15 %. Otherwise cleaned GPS distance is used. The choice is recorded as `distance_source`.

## Time

- **Elapsed** = last − first timestamp.
- **Moving.** An interval is moving when windowed speed ≥ 0.5 m/s and distance progressed. Gaps > 60 s (auto-pause) count as moving only if the average speed across the gap is ≥ 0.5 m/s.
- **Stoppages.** Runs of non-moving intervals totalling ≥ 10 s, with their position and distance.
- **Clock repair.** A backwards timestamp jump whose file-order step is spatially continuous (< 50 m) is treated as a device clock correction, and later samples are shifted by the median interval. Otherwise samples are stably sorted.

## Pace and splits

- **Pace** = moving time / distance (s/km).
- **Km splits.** Times at each kilometre boundary are linearly interpolated between samples. The last partial split is kept.
- **Best efforts** (400 m, 1 km, 1 mile, 5 km, 10 km, half, marathon): the minimum elapsed time over any window covering the target distance. For piecewise-linear progress, the optimum has one endpoint on a sample, so each sample is tested both as a window end and as a window start (O(n log n)). On a stop, distance plateaus, so the window start takes the _latest_ time at that distance and stops are not charged to the effort.
- **Split type.** Second-half versus first-half moving time: `even` within ±1 %, otherwise `negative` (faster) or `positive`.
- **Pace variability.** Coefficient of variation of moving pace across full kilometre splits. Requires ≥ 3 splits.

## Elevation

- **Smoothing.** Median over a ±10 s window, which removes barometric and GPS spikes.
- **Gain/loss.** Hysteresis accumulation: a change is counted only once it exceeds 3 m from the last anchor. Oscillation smaller than the threshold therefore adds nothing.
- **Grade-adjusted pace (model).** Uses Minetti et al. (2002), _J Appl Physiol_ 93:1039, for the energy cost of running at grade _i_: `C(i) = 155.4i⁵ − 30.4i⁴ − 43.3i³ + 46.3i² + 19.5i + 3.6` J·kg⁻¹·m⁻¹. _i_ is clamped to ±0.45, the measured range, and computed over ≥ 50 m segments. Equivalent flat distance = Σ dᵢ·C(iᵢ)/C(0), and GAP = moving time / equivalent distance. This is a population-average model, not an individual measurement.

## Heart rate

- **Aerobic decoupling (Pa:HR).** Efficiency factor EF = speed / mean HR for the first and second halves of moving time. Decoupling = (EF₁ − EF₂)/EF₁. Reported only with ≥ 80 % HR coverage and ≥ 20 min moving time. It is meaningful only for steady efforts, and the UI says so.
- Samples outside 25–250 bpm are discarded.

## Cadence

FIT and Garmin-style GPX report running cadence per foot (strides/min). It is stored as steps/min (×2). GPX cadence is doubled only when its median is below 120, which identifies per-foot values.

## Classification (estimate)

Labelled "Estimated type" with its basis everywhere it appears. The rules apply in order:

1. **intervals**: ≥ 5 device laps, with ≥ 3 within 8 % of the fastest lap pace and ≥ 2 at least 20 % slower.
2. **long**: moving time ≥ 90 min.
3. **fartlek_or_mixed**: km pace CV > 0.12.
4. **steady**: everything else.

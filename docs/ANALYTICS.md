# KM Analyze

## "Why was this run different?"

`GET /api/analytics/explain/:id` → `comparable_candidates(id)` (SQL) + 60-day history → analytics `POST /v1/analyze/explain`.

1. **Comparable runs.** Same sport family, distance ratio within [0.75, 1.33], started within the 365 days _before_ the target (later runs never inform an earlier one). SQL pre-filters to 60 candidates with tracks simplified to ~10 m. Python ranks by |ln(distance ratio)| with a 0.5 bonus when ≥ 60 % of the target track (sampled every 100 m) lies within 50 m of the candidate's track, i.e. the same route. The top 10 are used.
2. **Baseline.** Median and MAD per feature over the comparables. Robust z = (x − median)/(1.4826·MAD).
3. **Reporting rule.** A feature is listed only if |z| ≥ 2 (or MAD = 0 and the value differs) **and** |x − median| ≥ its minimum effect size. Statistically unusual but trivially small differences are suppressed. Fewer than 3 comparables returns `insufficient_history` with no observations.

| Feature                                               | Group    | Min. effect    | Source                              |
| ----------------------------------------------------- | -------- | -------------- | ----------------------------------- |
| Moving pace                                           | measured | 6 s/km         | device/file                         |
| Climbing per km                                       | measured | 4 m/km         | smoothed elevation, hysteresis gain |
| Time stopped / number of stops                        | measured | 60 s / 2       | stoppage detection                  |
| Pace variability (km CV)                              | measured | 0.03           | splits                              |
| Average HR / cadence                                  | measured | 5 bpm / 4 spm  | device                              |
| Grade-adjusted pace                                   | modeled  | 6 s/km         | Minetti 2002                        |
| Speed per heartbeat (m/beat)                          | modeled  | 0.04           | speed / HR                          |
| Aerobic decoupling                                    | modeled  | 3 pp           | Pa:HR                               |
| Temperature / wind                                    | context  | 6 °C / 10 km/h | Open-Meteo model at the start hour  |
| Distance in previous 7 days / days since previous run | context  | 10 km / 2 days | the athlete's own records           |

**Explanations** are rules that link a pace difference to the observed differences that could plausibly relate to it: climbing (with a note when grade-adjusted pace was normal), stops, temperature, wind, recent volume, rest, pacing variability, and higher HR at a given speed. Every explanation cites its evidence keys. The wording is "may have contributed" or "possible", never causal. HR findings explicitly state they are not a medical assessment.

## History overview

`GET /api/analytics/overview?today=YYYY-MM-DD` (365 days, computed in `lib/analytics.ts`):

- **Personal bests**: the fastest best-effort segment per distance across running activities. Ties go to the earlier run.
- **Weekly volume**: Monday-based local weeks, computed in UTC date arithmetic so DST cannot shift a run into another week.
- **HR load**: Edwards' TRIMP, Σ minutes in each %HRmax zone (50–60 … 90–100) × weights 1–5, from the 5-bpm histogram stored at import. HRmax is the highest HR recorded in the period and is labelled as an estimate.
- **Load trend**: last-7-day moving time / (28-day moving time ÷ 4). Shown as a descriptive trend only. KindaMoving makes no injury-risk prediction (the ACWR literature does not support individual prediction).
- **Consistency**: active weeks out of the last 12, runs per week, and the current streak of consecutive active weeks.

## Comparison

`/app/activities/compare?a=&b=` shows summary metrics and kilometre splits side by side. The URL holds the state, so comparisons are linkable. Splits align by distance from each start; same-route position alignment is Ghost's job (see [GHOST.md](GHOST.md)).

## Weather

Open-Meteo hourly data at the start hour (CC BY 4.0). Requests use coordinates rounded to 0.01°. The free endpoints are licensed for **non-commercial** use only, so a commercial deployment must set `OPEN_METEO_API_KEY`. `WEATHER_DISABLED=true` turns enrichment off. Values are model reanalysis or forecast output, not station measurements, and the UI labels them that way.

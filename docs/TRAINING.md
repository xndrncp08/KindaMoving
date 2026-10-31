# KM Train

Deterministic, transparent logic. The same inputs always give the same plan. KindaMoving makes **no injury-risk prediction** and prescribes no aggressive workloads.

## Inputs (measured, not assumed)

- **Current volume**: the average weekly distance over the last 4 weeks of logged runs. The onboarding estimate is used only when no runs were logged, and the plan preview says which basis was used.
- **Paces**: the best 10 km-equivalent time from the athlete's recorded best efforts of ≥ 3 km over the last year, via Riegel (1981), `T₂ = T₁·(D₂/D₁)^1.06`. Shorter efforts are excluded because they overpredict longer races. Without qualifying efforts, an experience-level default is used and labelled as such.
- **Zones** (× 10 km-equivalent pace per km): recovery 1.30–1.40 · easy 1.18–1.30 · steady 1.10–1.17 · marathon 1.06–1.10 · threshold 1.01–1.04 · interval 0.95–0.98 · repetition 0.90–0.94. These are coaching heuristics and are shown as estimates.

## Plan rules (`lib/training/plan.ts`, tested in `tests/training.test.ts`)

| Rule               | Value                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Length             | 4–30 weeks, starting the Monday after today, ending on race day                                                                                         |
| Weekly progression | ≤ +10 % per week; every 4th week is a 20 % cutback; progression resumes from the pre-cutback level                                                      |
| Peak volume        | min(ceiling for race/experience, 1.6 × current). A runner already above the ceiling _maintains_                                                         |
| Ceilings (km/week) | 5k 30/40/55 · 10k 35/50/65 · half 40/55/75 · marathon 50/70/95 (new/regular/experienced)                                                                |
| Long run           | 25 % (base) / 30 % of the week, ≥ 5 km, ≤ cap (5k 12 · 10k 16 · half 21 · marathon 32 km), ≤ previous long + 2 km                                       |
| Quality sessions   | 1 per week (base: tempo; build/peak: intervals), 2 for experienced runners with ≥ 5 run days outside base. New runners have no quality sessions in base |
| Hard-day spacing   | Long, tempo, intervals and race are never on consecutive days, _including across the Sunday → Monday boundary_                                          |
| Taper              | 5k/10k: 1 week (60 %); half: 2 (75 %, 50 %); marathon: 3 (75 %, 60 %, 45 %)                                                                             |
| Race week          | Race on race day, a short shake-out the day before is replaced by rest, nothing after the race                                                          |

Plans are saved atomically (`create_training_plan`): the plan and every workout, or nothing. The server regenerates the plan on save and never trusts a client-supplied plan.

## Structured workouts

Steps are warm-up / work / recovery / cool-down, each measured by distance **or** duration, with an optional pace or HR range. `repeat` blocks hold intervals. Planned distance is derived from the steps (durations are converted at each step's target pace). Edits are protected by the unsaved-changes guard.

## Compliance and missed workouts (`lib/training/reconcile.ts`)

- A planned workout dated today or earlier matches an unlinked run on the same local date, choosing the closest distance. Ratio ≥ 0.8 is **completed**, 0.5–0.8 is **partial**, and lower stays unmatched. Linking is applied automatically because it is non-destructive.
- **Missed** (dated before today, no match):
  - easy/recovery runs are skipped, and missed volume is **never made up**;
  - long/tempo/intervals missed within the last 2 days move onto the first easy-run day in the next 3 days where every hard session stays ≥ 2 days apart. That easy run is skipped, so sessions are swapped, never stacked. Otherwise the session is skipped.
- Moves and skips are proposals until the athlete presses **Apply changes** (`apply_training_changes`, RLS-scoped).
- **Training-history comparison**: each workout lists previous completed sessions of the same type with the recorded distance, pace and HR.

## Conditions-aware alternatives

When a workout's planned route has a likely hazard (`caution` from [KM Conditions](CONDITIONS.md)), the workout shows the alternatives: same structure indoors (1 % treadmill incline), swap with a later easy day while keeping spacing, or choose or plan another route. Another saved route's conditions are checked when it is selected, never assumed clear.

## COROS

Structured workouts can be sent after an explicit confirmation: `createScheduledWorkout` when the date is today through +90 days (documented window), otherwise `createSingleWorkout`. The guide does not document the nested `course` fields, so the payload is **validated against the tool's live input schema** before any write. On mismatch nothing is sent, and the job fails with the exact missing or mistyped fields (`lib/coros/schema.ts`). The mapping in `lib/coros/workout.ts` is therefore unverified until exercised on a live connection. Writes are never auto-retried (outcome uncertainty).

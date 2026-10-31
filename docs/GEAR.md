# KM Gear

## Mileage without double counting

Shoe totals are **never stored**. `gear_analytics(today)` and `running_summary` compute them on every read from the activities that exist now:

```
total = baseline (initial_distance_m) + Σ distance of activities whose shoe_id is this shoe
```

So importing, deleting, editing or reassigning an activity changes the total immediately and exactly. Import deduplication (`import_activity`: same source object → `existing`; same run through another channel → `duplicate`) guarantees one activity per run, and therefore one contribution per run. Tested in `supabase/tests/phase2_gear.sql`: a default-attributed import, a COROS duplicate that adds nothing, reassignment between shoes, and deletion.

## Automatic attribution

An imported run (file or COROS) with no shoe receives the runner's **default** shoe if that shoe is not retired and was in service on the run's local date (`purchased_on ≤ date ≤ retired_on`). This is a database trigger, so every import path behaves the same. Manual entries are never auto-assigned, and an explicit assignment always wins. Exactly one shoe can be the default: choosing a new one moves the flag, and a unique index guards it.

## Reconciliation

The Gear page lists runs from the last 90 days without shoes and assigns them in bulk (`assign_shoe`, RLS-scoped; composite owner FKs make cross-account assignment impossible).

## Analytics per shoe

| Metric          | Definition                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Wear            | total ÷ expected lifespan (`target_distance_m`, default 700 km, editable)                                             |
| Cost per km     | purchase price ÷ distance tracked in KindaMoving (baseline excluded, since price relates to the runs you log)         |
| Projection      | date the expected lifespan is reached at the last-8-weeks rate; omitted when idle, retired or already past            |
| By workout type | distance, runs, pace and HR per type: the linked planned workout's kind, else the activity's estimated classification |
| Monthly         | distance per month, last 12 months                                                                                    |
| Rotation        | each shoe's share of distance over the last 30 days                                                                   |
| Wear notes      | optional dated observations (1–5 rating and a note)                                                                   |

Retirement keeps the full history. A retired shoe stops receiving automatic attribution and keeps its totals.

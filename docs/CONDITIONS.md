# KM Conditions: runnability intelligence

## Sources

| Source                                                      | Kinds                                                                                                                 | Freshness rule                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Runner reports (`report_condition`)                         | ice, snow, wet, flooding, construction, obstruction, lighting, surface, closure, other                                | Exponential decay by kind and weather                                                           |
| City of Calgary **Construction Detours** (`w8zq-79bq`)      | `closure` (severity 3) when sidewalk/pathway/pedestrian/crosswalk is mentioned, otherwise `construction` (severity 1) | Active until its published end; naive local times converted from America/Edmonton (DST-correct) |
| City of Calgary **Current Traffic Incidents** (`4jah-h97u`) | `obstruction` (severity 1)                                                                                            | Active for 3 h after the last update (the feed has no end time)                                 |

Official data comes from data.calgary.ca under the City's Open Data Terms (<https://data.calgary.ca/d/Open-Data-Terms/u45n-7awa>), imported by `GET /api/conditions/official` (cron, `CRON_SECRET`). On 2026-10-31 the live feeds held 239 detour rows (161 active, 48 pedestrian-relevant) and 1 incident. Imports upsert by source reference and never touch user reports.

## Confidence model (`apps/web/src/lib/conditions.ts`)

Reports of the same kind within 50 m form a cluster. For each cluster:

```
w   = reliability × 0.5^(age_h / half_life)              (official items: no decay until their end)
L   = logit(0.05) + Σ ln(1 + 99·w_support) − Σ ln(1 + 99·w_contradict)
p   = 1 / (1 + e^−L)
```

- **Evidence**: the report itself (reporter reliability), "Still there" confirmations (+, voter reliability 0.6), "Cleared" votes (−, 0.6). Flags are moderation signals and never count as evidence about the ground.
- **Independence**: each person counts once per direction (strongest evidence kept), so one person repeating a report cannot manufacture certainty. Identities are daily pseudonyms computed in SQL.
- **Reporter reliability**: Beta(2,2) posterior over votes cast by _other_ users on that reporter's reports in the last 180 days: `(2 + confirms) / (4 + confirms + clears + 2·flags)`. A new reporter starts at 0.5, and official sources are 0.95.
- **Half-lives (h)**: ice 18 · snow 24 · wet 4 · flooding 36 · construction 336 · obstruction 48 · lighting 720 · surface 1080 · closure 168 · other 24.
- **Environmental changes** (Open-Meteo hourly weather since the observation): ice ×0.25 after > 5 °C, ×1.5 with fresh snow or cold rain; snow ×0.4 after > 5 °C; wet ×2 with fresh rain, ×0.5 when dry and > 15 °C; flooding ×0.6 when dry.
- **Calibration**: one fresh, fully reliable report gives p ≈ 0.84; a new reporter (0.5) gives ≈ 0.72; an official item ≈ 0.83; one fresh "cleared" vote roughly cancels one report.
- **States**: `likely` (p ≥ 0.7), `possible` (≥ 0.35), `unlikely`, and `stale` (no evidence weight ≥ 0.1, meaning "old report, current state unknown"). `conflicting` is set when both supporting and contradicting weight are ≥ 0.3.
- Every assessment returns its factors (source, age, reliability, weight, log-odds contribution), and the UI shows them under "Why this confidence?".

**Absence of reports is never presented as safe.** Every API response and screen states that no report is not the same as clear.

## Use in routing and suitability

- Router hazards: clusters that are `likely` or `possible` become 40 m penalties with weight `p × severity/3`. Edge cost rises by `4 × weight`, and the score adds `3 × Σ weights` touched.
- Route suitability (`GET /api/routes/:id/conditions`) is recomputed from live reports within a 40 m corridor of the path on every request: `caution` (likely and severity ≥ 2), `check`, or `no_current_reports`. A report or vote invalidates the `conditions` query prefix, so overlays and route cards refresh together. Both also poll every 2 minutes while visible.

## Abuse prevention and moderation (enforced in SQL)

- 8 reports/hour and 30/day per user; 60 votes/hour. Observation time must fall within the last 72 h.
- No voting on your own report; one vote per person (changeable).
- Automatic hiding when ≥ 3 users flag a report and flags outnumber confirmations. Flags also lower the reporter's future reliability.
- Reports are readable only through `conditions_near` (definer). It never returns user IDs; your own reports are marked `own`. Reporters can delete their reports, and account deletion cascades.

## Privacy

Report locations are public by design (that is their purpose) but never linked to a person. Reporting is explicit and per-item; nothing is inferred from activities or routes.

## Limits

- Pilot geography is Calgary for official data; user reports work anywhere. Adding a city means adding its feeds to `lib/server/official.ts`.
- Weather adjustment uses an ~10 km model cell and the free Open-Meteo tier (non-commercial; set `OPEN_METEO_API_KEY` commercially).
- There is no moderator dashboard yet; moderation is automatic.

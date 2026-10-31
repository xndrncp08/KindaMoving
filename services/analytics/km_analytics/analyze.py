"""KM Analyze: comparable-run selection and "Why was this run different?".

Method (deterministic; documented in docs/ANALYTICS.md):

1. Comparable runs: same sport family, distance ratio within [0.75, 1.33],
   started within the 365 days before the target. Ranked by
   |ln(distance ratio)| minus a same-route bonus (track overlap >= 0.6).
   Up to 10 are used.
2. Baseline per feature: median and MAD across comparables. The robust z-score
   z = (x - median) / (1.4826 * MAD); 1.4826 makes MAD consistent with the
   standard deviation under normality.
3. A feature is reported as different only when it is both statistically
   unusual (|z| >= 2, or MAD == 0 and the value differs) and practically
   meaningful (|x - median| >= the feature's minimum effect size). Fewer than 3
   comparables -> "insufficient history" and no observations.
4. Observations are separated into measured facts, modeled estimates and
   context. Explanations are rule-based links between a slower/faster pace and
   other observed differences, always phrased as possibilities.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta

from .geo import LocalProjection, project_point_segment

MIN_COMPARABLES = 3
MAX_COMPARABLES = 10
Z_THRESHOLD = 2.0
SPORT_FAMILY = {"running": "run", "trail_running": "run", "treadmill_running": "run", "walking": "walk", "hiking": "walk"}


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    unit: str
    min_effect: float
    kind: str  # measured | modeled | context
    higher_is: str  # "slower" | "faster" | "neutral": how a higher value relates to pace, for explanations


FEATURES = [
    Feature("pace_s_per_km", "Moving pace", "s/km", 6.0, "measured", "neutral"),
    Feature("elevation_gain_per_km", "Climbing per km", "m/km", 4.0, "measured", "slower"),
    Feature("stopped_s", "Time stopped", "s", 60.0, "measured", "neutral"),
    Feature("stoppage_count", "Number of stops", "stops", 2.0, "measured", "neutral"),
    Feature("pace_cv", "Pace variability", "CV", 0.03, "measured", "neutral"),
    Feature("avg_hr", "Average heart rate", "bpm", 5.0, "measured", "neutral"),
    Feature("avg_cadence", "Cadence", "spm", 4.0, "measured", "neutral"),
    Feature("grade_adjusted_pace_s_per_km", "Grade-adjusted pace", "s/km", 6.0, "modeled", "neutral"),
    Feature("efficiency", "Speed per heartbeat", "m/beat", 0.04, "modeled", "neutral"),
    Feature("decoupling_pct", "Aerobic decoupling", "%", 3.0, "modeled", "neutral"),
    Feature("temperature_c", "Temperature", "°C", 6.0, "context", "neutral"),
    Feature("wind_kmh", "Wind speed", "km/h", 10.0, "context", "slower"),
    Feature("prior_7d_km", "Distance in the previous 7 days", "km", 10.0, "context", "neutral"),
    Feature("rest_days", "Days since previous run", "days", 2.0, "context", "neutral"),
]


def features(run: dict, history: list[dict]) -> dict[str, float | None]:
    """Flatten an activity summary (+ the athlete's history for context) into comparable features."""
    m = run.get("metrics") or {}
    dist = run.get("distance_m") or 0
    moving = run.get("moving_s") or run.get("elapsed_s")
    hr = run.get("avg_hr")
    speed = dist / moving if dist and moving else None
    w = run.get("weather") or {}
    start = _ts(run.get("start_time"))
    prior = [h for h in history if (t := _ts(h.get("start_time"))) and start and start - timedelta(days=7) <= t < start]
    earlier = sorted((t for h in history if (t := _ts(h.get("start_time"))) and start and t < start), reverse=True)
    return {
        "pace_s_per_km": m.get("pace_s_per_km") or (moving / (dist / 1000) if dist and moving else None),
        "elevation_gain_per_km": (run.get("elevation_gain_m") or 0) / (dist / 1000) if dist else None,
        "stopped_s": m.get("stopped_s"),
        "stoppage_count": m.get("stoppage_count"),
        "pace_cv": m.get("pace_cv"),
        "avg_hr": hr,
        "avg_cadence": run.get("avg_cadence"),
        "grade_adjusted_pace_s_per_km": m.get("grade_adjusted_pace_s_per_km"),
        "efficiency": round(speed * 60 / hr, 4) if speed and hr else None,
        "decoupling_pct": (m.get("decoupling") or {}).get("decoupling_pct"),
        "temperature_c": w.get("temperature_c"),
        "wind_kmh": w.get("wind_kmh"),
        "prior_7d_km": round(sum(h.get("distance_m") or 0 for h in prior) / 1000, 2) if start else None,
        "rest_days": round((start - earlier[0]).total_seconds() / 86400, 1) if start and earlier else None,
    }


def _ts(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def route_overlap(a: list[list[float]] | None, b: list[list[float]] | None, tolerance_m: float = 50.0, step_m: float = 100.0) -> float:
    """Fraction of track ``a`` (sampled every ``step_m``) lying within ``tolerance_m`` of track ``b``."""
    if not a or not b or len(a) < 2 or len(b) < 2:
        return 0.0
    proj = LocalProjection(a[0][1], a[0][0])
    pa = [proj.to_xy(lat, lon) for lon, lat in a]
    pb = [proj.to_xy(lat, lon) for lon, lat in b]
    samples, carry = [], 0.0
    for (x1, y1), (x2, y2) in zip(pa, pa[1:]):
        seg = math.hypot(x2 - x1, y2 - y1)
        pos = carry
        while pos <= seg and seg > 0:
            f = pos / seg
            samples.append((x1 + f * (x2 - x1), y1 + f * (y2 - y1)))
            pos += step_m
        carry = pos - seg
    if not samples:
        return 0.0
    # Grid index over b's segments keeps this ~linear for typical track sizes.
    cell = max(tolerance_m, 50.0)
    grid: dict[tuple[int, int], list[int]] = {}
    for i, ((x1, y1), (x2, y2)) in enumerate(zip(pb, pb[1:])):
        for gx in range(int(min(x1, x2) // cell) - 1, int(max(x1, x2) // cell) + 2):
            for gy in range(int(min(y1, y2) // cell) - 1, int(max(y1, y2) // cell) + 2):
                grid.setdefault((gx, gy), []).append(i)
    near = 0
    for x, y in samples:
        for i in grid.get((int(x // cell), int(y // cell)), ()):
            if project_point_segment(x, y, *pb[i], *pb[i + 1])[1] <= tolerance_m:
                near += 1
                break
    return near / len(samples)


def select_comparables(target: dict, candidates: list[dict]) -> list[dict]:
    family = SPORT_FAMILY.get(target.get("sport", "running"), target.get("sport"))
    start = _ts(target.get("start_time"))
    dist = target.get("distance_m") or 0
    scored = []
    for c in candidates:
        if c.get("id") == target.get("id") or SPORT_FAMILY.get(c.get("sport", "running"), c.get("sport")) != family:
            continue
        cd, ct = c.get("distance_m") or 0, _ts(c.get("start_time"))
        if not cd or not dist or not (0.75 <= cd / dist <= 1.33):
            continue
        if start and ct and not (start - timedelta(days=365) <= ct < start):
            continue
        overlap = route_overlap(target.get("track_coords"), c.get("track_coords"))
        score = abs(math.log(cd / dist)) - (0.5 if overlap >= 0.6 else 0.0)
        scored.append((score, str(c.get("start_time")), {**c, "same_route": overlap >= 0.6, "route_overlap": round(overlap, 2)}))
    scored.sort(key=lambda s: (s[0], s[1]))
    return [s[2] for s in scored[:MAX_COMPARABLES]]


def explain(target: dict, candidates: list[dict], history: list[dict]) -> dict:
    comps = select_comparables(target, candidates)
    base = {
        "comparables": [
            {k: c.get(k) for k in ("id", "title", "start_time", "distance_m", "same_route", "route_overlap")} for c in comps
        ],
        "method": "robust z-score (median/MAD) against comparable runs; |z| >= 2 and minimum effect size",
    }
    if len(comps) < MIN_COMPARABLES:
        return {
            **base,
            "status": "insufficient_history",
            "message": f"Needs at least {MIN_COMPARABLES} comparable runs (similar distance, same sport, past year); found {len(comps)}.",
            "measured": [],
            "modeled": [],
            "context": [],
            "possible_explanations": [],
        }
    tf = features(target, history)
    cf = [features(c, history) for c in comps]
    groups: dict[str, list[dict]] = {"measured": [], "modeled": [], "context": []}
    diffs: dict[str, dict] = {}
    for f in FEATURES:
        x = tf.get(f.key)
        vals = [v[f.key] for v in cf if v.get(f.key) is not None]
        if x is None or len(vals) < MIN_COMPARABLES:
            continue
        med = statistics.median(vals)
        mad = statistics.median(abs(v - med) for v in vals)
        delta = x - med
        z = delta / (1.4826 * mad) if mad > 0 else (math.inf if abs(delta) > 1e-9 else 0.0)
        if abs(z) >= Z_THRESHOLD and abs(delta) >= f.min_effect:
            obs = {
                "key": f.key,
                "label": f.label,
                "unit": f.unit,
                "value": round(x, 3),
                "typical": round(med, 3),
                "difference": round(delta, 3),
                "robust_z": None if math.isinf(z) else round(z, 2),
                "n": len(vals),
            }
            groups[f.kind].append(obs)
            diffs[f.key] = obs
    return {**base, "status": "ok", **groups, "possible_explanations": explanations(diffs)}


def explanations(d: dict[str, dict]) -> list[dict]:
    """Rule-based, evidence-linked possibilities. Never causal or medical claims."""
    out = []
    pace = d.get("pace_s_per_km")
    slower = pace is not None and pace["difference"] > 0
    faster = pace is not None and pace["difference"] < 0

    def add(text: str, *keys: str):
        out.append({"text": text, "evidence": [k for k in keys if k in d]})

    if pace:
        if "elevation_gain_per_km" in d and (d["elevation_gain_per_km"]["difference"] > 0) == slower:
            more = "more" if slower else "less"
            gap = d.get("grade_adjusted_pace_s_per_km")
            note = "" if gap else " Grade-adjusted pace was within your usual range, so the terrain model accounts for much of the difference."
            add(f"This route had {more} climbing per km than your comparable runs, which may have contributed to the {'slower' if slower else 'faster'} pace.{note}", "elevation_gain_per_km", "grade_adjusted_pace_s_per_km")
        if slower and ("stopped_s" in d or "stoppage_count" in d):
            add("You stopped more than usual. Moving pace excludes stops, but frequent interruptions can disrupt rhythm.", "stopped_s", "stoppage_count")
        if "temperature_c" in d:
            hot = d["temperature_c"]["difference"] > 0
            add(f"It was {'warmer' if hot else 'colder'} than on your comparable runs; temperature can affect pace and heart rate.", "temperature_c")
        if slower and "wind_kmh" in d and d["wind_kmh"]["difference"] > 0:
            add("Wind was stronger than usual (model weather at the start location and hour).", "wind_kmh")
        if slower and "prior_7d_km" in d and d["prior_7d_km"]["difference"] > 0:
            add("You ran more distance than usual in the 7 days before this run; accumulated training can show up as slower pace.", "prior_7d_km")
        if faster and "rest_days" in d and d["rest_days"]["difference"] > 0:
            add("You had more rest days than usual before this run.", "rest_days")
        if "pace_cv" in d and d["pace_cv"]["difference"] > 0:
            add("Pace was less even than usual (higher variability across km splits).", "pace_cv")
    if "efficiency" in d and d["efficiency"]["difference"] < 0 and "avg_hr" in d:
        add("Heart rate was higher for the speed you ran than usual (lower speed per heartbeat). Heat, fatigue, illness, terrain or sensor error are all possible; this is not a medical assessment.", "efficiency", "avg_hr", "temperature_c")
    if not out and pace:
        add("Pace differed from your comparable runs, but no other recorded variable differed enough to suggest a reason.", "pace_s_per_km")
    return out

import pytest

from km_analytics.analyze import explain, route_overlap, select_comparables

LINE = [[-114.07 + k * 0.001, 51.04] for k in range(60)]  # ~4.2 km east-west
OTHER = [[-114.20, 51.10 + k * 0.001] for k in range(60)]


def run(i, *, dist=10000, pace=300, gain=50, stopped=30, stops=1, hr=150, temp=12.0, day=1, track=LINE, cv=0.02):
    return {
        "id": f"r{i}",
        "title": f"Run {i}",
        "sport": "running",
        "start_time": f"2026-09-{day:02d}T13:00:00+00:00",
        "distance_m": dist,
        "moving_s": pace * dist / 1000,
        "elevation_gain_m": gain,
        "avg_hr": hr,
        "metrics": {"pace_s_per_km": pace, "stopped_s": stopped, "stoppage_count": stops, "pace_cv": cv, "grade_adjusted_pace_s_per_km": pace},
        "weather": {"temperature_c": temp, "wind_kmh": 10},
        "track_coords": track,
    }


BASE = [run(i, pace=300 + (i % 3), hr=150 + (i % 2), temp=12 + (i % 2), day=i + 1) for i in range(8)]


def test_route_overlap():
    assert route_overlap(LINE, LINE) == 1.0
    assert route_overlap(LINE, OTHER) == 0.0
    assert route_overlap(LINE, None) == 0.0


def test_comparables_filter_distance_sport_and_time():
    target = run(99, day=28)
    cands = BASE + [run(50, dist=3000, day=5), {**run(51, day=6), "sport": "cycling"}, run(52, day=29)]
    ids = {c["id"] for c in select_comparables(target, cands)}
    assert ids == {c["id"] for c in BASE}  # wrong distance, sport and *future* runs excluded


def test_insufficient_history_reports_no_observations():
    out = explain(run(99, day=28), BASE[:2], [])
    assert out["status"] == "insufficient_history" and out["measured"] == [] and out["possible_explanations"] == []


def test_unremarkable_run_has_no_findings():
    out = explain(run(99, pace=301, day=28), BASE, BASE)
    assert out["status"] == "ok" and out["measured"] == [] and out["possible_explanations"] == []


def test_hilly_hot_run_is_explained_with_evidence():
    target = run(99, pace=330, gain=180, temp=27.0, hr=162, day=9)
    target["metrics"]["grade_adjusted_pace_s_per_km"] = 302  # terrain model explains the pace
    out = explain(target, BASE, BASE)
    measured = {o["key"] for o in out["measured"]}
    assert {"pace_s_per_km", "elevation_gain_per_km", "avg_hr"} <= measured
    assert {o["key"] for o in out["context"]} == {"temperature_c"}
    texts = " ".join(e["text"] for e in out["possible_explanations"])
    assert "climbing" in texts and "warmer" in texts and "terrain model" in texts
    for e in out["possible_explanations"]:
        assert e["evidence"], "every explanation must cite evidence"
        assert "caused" not in e["text"].lower()


def test_small_but_consistent_difference_needs_minimum_effect():
    # 3 s/km slower is statistically unusual vs a tight baseline but below the 6 s/km effect size.
    out = explain(run(99, pace=304, day=28), BASE, BASE)
    assert "pace_s_per_km" not in {o["key"] for o in out["measured"]}


def test_explain_is_deterministic():
    target = run(99, pace=330, gain=180, day=28)
    assert explain(target, BASE, BASE) == explain(target, list(reversed(BASE)), BASE)

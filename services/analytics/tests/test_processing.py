import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from km_analytics import metrics
from km_analytics.clean import elevation_gain_loss, process
from km_analytics.fit import parse_fit
from km_analytics.geo import haversine_m, segment_m, vincenty_m
from km_analytics.gpx import parse_gpx
from km_analytics.model import ActivityFileError, Sample
from km_analytics.pipeline import analyze_file

from .fixtures import T0, continue_from, parsed, straight_run, to_fit, to_gpx


# ---------- geodesy ----------
def test_vincenty_reference_geodesic():
    # Flinders Peak -> Buninyong, the standard Vincenty (1975) test line: 54 972.271 m.
    d = vincenty_m(-(37 + 57 / 60 + 3.72030 / 3600), 144 + 25 / 60 + 29.52440 / 3600, -(37 + 39 / 60 + 10.15610 / 3600), 143 + 55 / 60 + 35.38390 / 3600)
    assert d == pytest.approx(54972.271, abs=0.001)


def test_segment_matches_vincenty_at_gps_spacing():
    for d_lat, d_lon in [(0.0009, 0.0), (0.0, 0.0014), (0.0006, 0.0009)]:
        exact = vincenty_m(51.0, -114.0, 51.0 + d_lat, -114.0 + d_lon)
        assert segment_m(51.0, -114.0, 51.0 + d_lat, -114.0 + d_lon) == pytest.approx(exact, rel=1e-6)
    assert haversine_m(51.0, -114.0, 51.0, -113.0) == pytest.approx(vincenty_m(51.0, -114.0, 51.0, -113.0), rel=5e-3)


# ---------- parsers ----------
def test_gpx_round_trip_reads_extensions_and_cadence():
    a = parse_gpx(to_gpx(straight_run(60)))
    assert len(a.samples) == 61 and a.name == "Fixture run" and a.sport == "running"
    assert a.samples[5].hr == 150 and a.samples[5].cad == 170  # per-foot 85 doubled to steps/min


@pytest.mark.parametrize(
    "payload",
    [
        b'<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY a "aaaa">]><gpx>&a;</gpx>',
        b"<gpx><trk><trkseg><trkpt lat='1' lon='1'></trk>",
        b"<kml></kml>",
        b"<gpx version='1.1'><wpt lat='51' lon='-114'/></gpx>",
    ],
)
def test_gpx_rejects_unsafe_or_empty(payload):
    with pytest.raises(ActivityFileError):
        parse_gpx(payload)


def test_gpx_naive_time_is_utc_with_warning():
    raw = b'<gpx><trk><trkseg><trkpt lat="51" lon="-114"><time>2026-10-01T06:00:00</time></trkpt></trkseg></trk></gpx>'
    a = parse_gpx(raw)
    assert a.samples[0].t == 1790834400.0 and "treated as UTC" in a.warnings[0]


def test_fit_round_trip_offset_and_laps():
    s = straight_run(600)
    a = parse_fit(to_fit(s, laps=[(T0, T0 + 300, 900.0), (T0 + 300, T0 + 600, 900.0)]))
    assert len(a.samples) == 601 and a.utc_offset_s == -6 * 3600
    assert a.samples[10].lat == pytest.approx(s[10].lat, abs=1e-6) and a.samples[10].cad == 170
    assert len(a.laps) == 2 and a.device["manufacturer"] == "coros"


def test_fit_corruption_and_truncation_are_rejected():
    data = bytearray(to_fit(straight_run(120)))
    flipped = bytearray(data)
    flipped[len(data) // 2] ^= 0xFF
    for bad in (bytes(flipped), bytes(data[: len(data) // 2]), b"not a fit file at all"):
        with pytest.raises(ActivityFileError):
            parse_fit(bad)


def test_fit_course_file_is_not_an_activity():
    with pytest.raises(ActivityFileError, match="not an activity"):
        parse_fit(to_fit(straight_run(30), file_type="course"))


# ---------- cleaning ----------
def test_clean_constant_run_distance_and_moving_time():
    track = process(parsed(straight_run(1800, speed=3.0)))
    assert track.dist[-1] == pytest.approx(5400, rel=1e-3)
    assert metrics.moving_time_series(track)[-1] == pytest.approx(1800, abs=2)
    assert track.stoppages == []


def test_gps_spike_is_rejected_without_inflating_distance():
    s = straight_run(600)
    s[300] = Sample(t=s[300].t, lat=s[300].lat + 0.01, lon=s[300].lon, hr=150)  # ~1.1 km teleport
    track = process(parsed(s))
    assert track.quality["gps_outliers"] == 1
    assert track.dist[-1] == pytest.approx(1800, rel=2e-3)


def test_null_island_and_missing_fixes_are_interpolated():
    s = straight_run(600)
    for i in range(100, 160):
        s[i] = Sample(t=s[i].t, lat=0.0, lon=0.0, hr=150)
    track = process(parsed(s))
    assert track.dist[-1] == pytest.approx(1800, rel=2e-3)
    assert metrics.moving_time_series(track)[-1] == pytest.approx(600, abs=2)


def test_stationary_jitter_is_a_stoppage_not_distance():
    run1 = straight_run(300, speed=3.0)
    end_lat, end_lon = run1[-1].lat, run1[-1].lon
    from km_analytics.geo import destination

    stop = []
    import random

    rng = random.Random(7)
    for k in range(1, 121):  # two minutes at a crossing, 4 m GPS jitter
        lat, lon = destination(end_lat, end_lon, rng.uniform(0, 360), rng.uniform(0, 4))
        stop.append(Sample(t=run1[-1].t + k, lat=lat, lon=lon, hr=140))
    run2 = continue_from(run1, straight_run(300, speed=3.0, start=stop[-1].t + 1))
    track = process(parsed(run1 + stop + run2))
    assert len(track.stoppages) == 1
    assert track.stoppages[0]["duration_s"] == pytest.approx(120, abs=12)
    assert track.dist[-1] == pytest.approx(1800, rel=0.02)
    moving = metrics.moving_time_series(track)[-1]
    assert moving == pytest.approx(600, abs=15) and track.t[-1] - track.t[0] == pytest.approx(721, abs=1)


def test_backwards_clock_jump_is_repaired():
    s = straight_run(600)
    for smp in s[300:]:
        smp.t -= 3600  # device clock corrected mid-run
    track = process(parsed(s))
    assert track.quality["clock_corrections"] == 1
    assert track.t[-1] - track.t[0] == pytest.approx(600, abs=1.5)
    assert track.dist[-1] == pytest.approx(1800, rel=2e-3)


def test_out_of_order_segments_are_sorted():
    s = straight_run(600)
    shuffled = s[300:] + s[:300]  # spatially discontinuous: a merge, not a clock fix
    track = process(parsed(shuffled))
    assert track.quality["clock_corrections"] == 0
    assert track.t == sorted(track.t) and track.dist[-1] == pytest.approx(1800, rel=2e-3)


def test_auto_pause_gap_counts_as_elapsed_not_moving():
    a = straight_run(300)
    b = continue_from(a, straight_run(300, start=a[-1].t + 600))  # 10 min paused, no recording
    track = process(parsed(a + b))
    assert metrics.moving_time_series(track)[-1] == pytest.approx(600, abs=3)
    assert track.t[-1] - track.t[0] == pytest.approx(1200, abs=2)


def test_cross_midnight_local_date_uses_file_offset():
    start = T0 + 11 * 3600 - 600  # 2026-10-02 00:00 UTC minus 10 min ... local -6h = 17:50
    late = straight_run(1800, start=start + 6 * 3600)  # local 23:50 -> 00:20
    out = analyze_file(to_fit(late), "fit")
    assert out["crosses_midnight"] is True and out["utc_offset_s"] == -21600
    assert out["local_date"] == "2026-10-01"


def test_timezone_fallback_is_marked_assumed():
    out = analyze_file(to_gpx(straight_run(120)), "gpx", "America/Edmonton")
    assert out["timezone_assumed"] is True and out["utc_offset_s"] == -21600


def test_rejects_untimed_or_degenerate_tracks():
    with pytest.raises(ActivityFileError):
        process(parsed([Sample(t=T0, lat=51, lon=-114)]))
    with pytest.raises(ActivityFileError):
        process(parsed([Sample(t=T0 + k, lat=None, lon=None) for k in range(10)]))


def test_device_distance_preferred_when_consistent():
    out = analyze_file(to_fit(straight_run(600)), "fit")
    assert out["distance_source"] == "device"
    assert out["summary"]["distance_m"] == pytest.approx(1800, rel=1e-3)


# ---------- elevation ----------
def test_elevation_noise_does_not_accumulate():
    noisy = [1045 + (1.5 if k % 2 else -1.5) for k in range(1000)]
    assert elevation_gain_loss(noisy) == (0.0, 0.0)
    ramp = [1000 + k * 0.1 for k in range(1001)]  # 100 m climb
    gain, loss = elevation_gain_loss(ramp)
    assert gain == pytest.approx(99, abs=3) and loss == 0


def test_elevation_spike_removed_by_median():
    s = straight_run(600)
    s[200].ele = 1500.0
    track = process(parsed(s))
    assert max(e for e in track.ele if e) == 1045.0


# ---------- metrics ----------
def test_splits_and_best_efforts_constant_pace():
    track = process(parsed(straight_run(3600, speed=3.0)))  # 10.8 km at 5:33.3/km
    summary = metrics.summarize(track)
    km = summary["splits"]
    assert len(km) == 11 and km[0]["pace_s_per_km"] == pytest.approx(333.3, abs=0.5)
    assert sum(s["distance_m"] for s in km) == pytest.approx(summary["distance_m"], abs=0.5)
    assert summary["best_efforts"]["5k"]["elapsed_s"] == pytest.approx(5000 / 3, abs=1)
    assert summary["best_efforts"]["10k"]["elapsed_s"] == pytest.approx(10000 / 3, abs=1)
    assert "half" not in summary["best_efforts"]
    assert summary["split_type"]["kind"] == "even"
    assert summary["grade_adjusted_pace_s_per_km"] == pytest.approx(summary["pace_s_per_km"], rel=1e-3)


def test_best_effort_excludes_a_preceding_stop():
    a = straight_run(400, speed=2.5)  # 1 km at 6:40
    stop = [Sample(t=a[-1].t + k, lat=a[-1].lat, lon=a[-1].lon) for k in range(1, 200)]
    b = continue_from(a, straight_run(400, speed=4.0, start=stop[-1].t + 1))  # 1.6 km fast
    track = process(parsed(a + stop + b))
    assert metrics.best_efforts(track)["1k"]["elapsed_s"] == pytest.approx(250, abs=2)


def test_negative_split_and_minetti():
    first = straight_run(900, speed=3.0)
    fast = first + continue_from(first, straight_run(800, speed=3.4, start=T0 + 901))
    track = process(parsed(fast))
    assert metrics.split_type(track)["kind"] == "negative"
    assert metrics.minetti_cost(0) == pytest.approx(3.6)
    assert metrics.minetti_cost(0.1) > 3.6 > metrics.minetti_cost(-0.1)
    assert metrics.minetti_cost(1.0) == metrics.minetti_cost(0.45)


def test_decoupling_requires_hr_and_duration():
    assert metrics.decoupling(process(parsed(straight_run(1800, hr=None)))) is None
    s = straight_run(2400)
    for k, smp in enumerate(s):
        smp.hr = 140 + 20 * k / len(s)  # drift up at constant pace
    d = metrics.decoupling(process(parsed(s)))
    assert d["decoupling_pct"] == pytest.approx(100 * (1 - 145 / 155), abs=0.6)


def test_interval_classification_from_laps():
    s, laps, t = [], [], T0
    for rep in range(5):
        for speed, secs in ((4.5, 180), (2.2, 120)):
            seg = straight_run(secs, speed=speed, start=t)
            if s:
                seg = continue_from(s, seg)[1:]
            laps.append((t, t + secs, speed * secs))
            s.extend(seg)
            t += secs
    out = analyze_file(to_fit(s, laps=laps), "fit")
    assert out["summary"]["classification"]["kind"] == "intervals"
    assert len(out["summary"]["laps"]) == 10


# ---------- properties ----------
@settings(max_examples=30, deadline=None)
@given(speed=st.floats(1.5, 6.0), seconds=st.integers(600, 2400), bearing=st.floats(0, 359))
def test_property_distance_equals_speed_times_time(speed, seconds, bearing):
    track = process(parsed(straight_run(seconds, speed=speed, bearing=bearing)))
    assert track.dist[-1] == pytest.approx(speed * seconds, rel=2e-3)


@settings(max_examples=20, deadline=None)
@given(noise=st.floats(0, 3), seed=st.integers(0, 10_000))
def test_property_best_efforts_are_monotone(noise, seed):
    track = process(parsed(straight_run(3000, speed=3.5, noise_m=noise, seed=seed)))
    efforts = metrics.best_efforts(track)
    times = [efforts[k]["elapsed_s"] for k in metrics.BEST_EFFORTS if k in efforts]
    assert times == sorted(times)
    assert all(not math.isnan(v) for v in times)


def test_large_activity_throughput():
    # 6 h at 1 Hz = 21,601 samples; the full pipeline must stay comfortably interactive.
    import time

    data = to_fit(straight_run(6 * 3600, speed=2.8, noise_m=2))
    start = time.perf_counter()
    out = analyze_file(data, "fit")
    elapsed = time.perf_counter() - start
    assert 10000 < len(out["streams"]["t"]) <= 20001 and elapsed < 15

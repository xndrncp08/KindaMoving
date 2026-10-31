import pytest

from km_analytics.geo import LocalProjection
from km_analytics.ghost import align

from .fixtures import ORIGIN

proj = LocalProjection(*ORIGIN)


def streams(path_xy, speed, noise=0.0, seed=1, start_offset=0.0):
    """Sample a polyline (metres) at 1 Hz for a runner at constant speed."""
    import random

    rng = random.Random(seed)
    cum = [0.0]
    for (x1, y1), (x2, y2) in zip(path_xy, path_xy[1:]):
        cum.append(cum[-1] + ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5)
    t, lat, lon, dist = [], [], [], []
    k, s = 0, 0.0
    while s <= cum[-1]:
        while k + 1 < len(cum) - 1 and cum[k + 1] < s:
            k += 1
        f = (s - cum[k]) / (cum[k + 1] - cum[k])
        x = path_xy[k][0] + f * (path_xy[k + 1][0] - path_xy[k][0]) + rng.uniform(-noise, noise)
        y = path_xy[k][1] + f * (path_xy[k + 1][1] - path_xy[k][1]) + rng.uniform(-noise, noise)
        la, lo = proj.to_latlon(x, y)
        t.append(len(t) + start_offset)
        lat.append(la)
        lon.append(lo)
        dist.append(s)  # processed distance, as the pipeline would provide
        s += speed
    return {"t": t, "lat": lat, "lon": lon, "dist": dist}


LOOP = [(0, 0), (1000, 0), (1000, 1000), (0, 1000), (0, 0)]  # 4 km square
OUT_BACK = [(0, 0), (2000, 0), (0, 0)]  # revisits every point


def test_constant_pace_difference_grows_linearly():
    ref = streams(LOOP, 3.0)
    ghost = streams(LOOP, 2.85, noise=3, seed=4)
    out = align({"streams": ref}, {"streams": ghost})
    assert out["status"] == "ok"
    # After 3 km the slower ghost trails by 3000/2.85 - 3000/3 = 52.6 s.
    g3 = next(g for g in out["gaps"] if g["s"] == 3000.0)
    assert g3["gap_s"] == pytest.approx(52.6, abs=4)
    assert out["splits"][0]["delta_s"] == pytest.approx(17.5, abs=3)
    assert out["comparability"]["matched_fraction"] > 0.99
    assert all(f["ahead_m"] >= -10 for f in out["frames"]), "the faster reference stays ahead"


def test_out_and_back_matching_is_monotonic():
    out = align({"streams": streams(OUT_BACK, 3.0)}, {"streams": streams(OUT_BACK, 3.0, noise=4, seed=9)})
    assert out["status"] == "ok"
    # Same pace: a naive nearest-point match would map the return leg onto the outbound leg (gap ~ -667 s).
    # At the apex both legs coincide, so position is ambiguous within the GPS noise there (documented).
    gaps = [g["gap_s"] for g in out["gaps"] if abs(g["s"] - 2000) > 25]
    assert max(abs(x) for x in gaps) < 3
    assert out["aligned_distance_m"] == pytest.approx(4000, abs=30)


def test_refuses_different_routes():
    other = [(0, 0), (0, -1000), (-1000, -1000), (-1000, 0), (0, 0)]
    out = align({"streams": streams(LOOP, 3.0)}, {"streams": streams(other, 3.0)})
    assert out["status"] == "not_comparable" and "overlap" in out["reasons"][0]


def test_refuses_much_shorter_run():
    half = [(0, 0), (1000, 0), (1000, 1000)]
    out = align({"streams": streams(LOOP, 3.0)}, {"streams": streams(half, 3.0)})
    assert out["status"] == "not_comparable"


def test_off_route_detour_is_reported_not_matched():
    detour = [(0, 0), (500, 0), (500, -150), (600, -150), (600, 0), (1000, 0), (1000, 1000), (0, 1000), (0, 0)]
    out = align({"streams": streams(LOOP, 3.0)}, {"streams": streams(detour, 3.0)})
    assert out["status"] == "ok"
    assert out["off_route"] and out["off_route"][0]["at_m"] == pytest.approx(500, abs=40)
    assert out["comparability"]["matched_fraction"] < 1


def test_frames_are_on_the_reference_line_and_deterministic():
    ref, ghost = streams(LOOP, 3.0), streams(LOOP, 2.9, noise=2)
    a = align({"streams": ref}, {"streams": ghost})
    assert a == align({"streams": ref}, {"streams": ghost})
    assert a["frames"][0]["t"] == 0 and a["frames"][1]["t"] == 5
    assert a["notes"][0].startswith("Simulated replay")

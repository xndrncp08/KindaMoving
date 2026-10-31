"""Form metrics on synthetic, deterministic landmark sequences plus the real video path.

No recorded footage of a person is used or fabricated: accuracy on real running
video is not claimed by these tests (see docs/FORM.md).
"""

import math
import os
from pathlib import Path

import pytest

from km_analytics.form import FormVideoError, Series, angle, cadence, foot_contacts, frame_metrics, summarize, view_type

MODEL = Path(__file__).resolve().parents[1] / "models" / "pose_landmarker_lite.task"


def runner(t: float, cadence_spm: float = 180.0, side_view: bool = True):
    """A stick-figure runner facing +x: pelvis bobs once per step, legs swing out of phase."""
    step = 60 / cadence_spm
    phase = 2 * math.pi * t / (2 * step)  # one stride = two steps
    hip = (0.5, 0.5 + 0.01 * math.cos(2 * math.pi * t / step))
    lm = [(0.5, 0.5, 0.0)] * 33

    def put(i, x, y, v=0.99):
        lm[i] = (x, y, v)

    put(0, hip[0] + 0.03, hip[1] - 0.3)  # nose ahead of hips -> facing +x
    sw = 0.0 if side_view else 0.08
    put(11, hip[0] + 0.02 - sw, hip[1] - 0.25)
    put(12, hip[0] + 0.02 + sw, hip[1] - 0.25)
    put(23, hip[0] - sw / 2, hip[1])
    put(24, hip[0] + sw / 2, hip[1])
    for side, (k, a, e, w, sh) in {0: (25, 27, 13, 15, 11), 1: (26, 28, 14, 16, 12)}.items():
        ph = phase + side * math.pi
        knee = (hip[0] + 0.08 * math.sin(ph), hip[1] + 0.15)
        put(k, *knee)
        put(a, knee[0] - 0.03 * (1 + math.cos(ph)), hip[1] + 0.3 + 0.03 * max(0.0, math.cos(ph)))
        put(e, lm[sh][0] - 0.05 * math.sin(ph), lm[sh][1] + 0.1)
        put(w, lm[e][0] + 0.06, lm[e][1] - 0.02)
    return lm


def test_angle_geometry():
    assert angle((0, 0), (1, 0), (2, 0)) == pytest.approx(180)
    assert angle((0, 1), (0, 0), (1, 0)) == pytest.approx(90)
    assert math.isnan(angle((0, 0), (0, 0), (1, 0)))


def test_cadence_from_pelvis_oscillation():
    fps = 60
    t = [i / fps for i in range(fps * 8)]
    for spm in (160, 172, 186):
        y = [0.5 + 0.01 * math.cos(2 * math.pi * x / (60 / spm)) for x in t]
        c = cadence(t, y)
        assert c["steps_per_min"] == pytest.approx(spm, abs=4) and c["confidence"] > 0.8
    assert cadence(t[:120], [0.5] * 120) is None  # too short
    assert cadence([i / 15 for i in range(200)], [0.5 + 0.01 * math.sin(i) for i in range(200)]) is None  # too few fps


def test_contacts_and_view():
    t = [i / 60 for i in range(600)]
    y = [0.8 + 0.03 * max(0.0, math.cos(2 * math.pi * x / (2 * 60 / 180))) for x in t]
    contacts = foot_contacts(t, y)
    gaps = [b - a for a, b in zip(contacts, contacts[1:])]
    assert gaps and all(g == pytest.approx(2 * 60 / 180, abs=0.03) for g in gaps)
    assert view_type([0.1, 0.12]) == "side" and view_type([0.9, 0.8]) == "front_or_back" and view_type([]) == "unknown"


def test_summary_of_synthetic_side_view():
    fps = 60
    t = [i / fps for i in range(fps * 6)]
    out = summarize(Series(t, [runner(x) for x in t], fps, 1920, 1080))
    assert out["usable"] and out["quality"]["view"] == "side" and out["quality"]["detection_rate"] == 1
    assert out["metrics"]["cadence"]["steps_per_min"] == pytest.approx(180, abs=5)
    assert out["metrics"]["step_time_s"]["median"] == pytest.approx(60 / 180, abs=0.04)
    assert 0 <= out["metrics"]["trunk_lean"]["median"] <= 20
    assert "Not a clinical" in out["disclaimer"]
    assert any("100+ fps" in w for w in out["warnings"])


def test_front_view_and_missing_runner_are_flagged():
    t = [i / 30 for i in range(150)]
    front = summarize(Series(t, [runner(x, side_view=False) for x in t], 30, 1280, 720))
    assert front["quality"]["view"] != "side" and any("side view" in w for w in front["warnings"])
    empty = summarize(Series(t, [None] * len(t), 30, 1280, 720))
    assert not empty["usable"] and empty["metrics"] == {} and any("detected in only 0%" in w for w in empty["warnings"])


def test_frame_metrics_skip_low_visibility():
    lm = runner(0.0)
    lm[25] = (lm[25][0], lm[25][1], 0.1)
    m = frame_metrics(lm)
    assert m["knee_l"] is None and m["knee_r"] is not None


@pytest.mark.skipif(not MODEL.exists(), reason="pose model not downloaded")
def test_real_video_pipeline_without_a_person(tmp_path):
    import cv2
    import numpy as np

    from km_analytics.form import analyze_video

    path = str(tmp_path / "empty.mp4")
    writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), 30, (1280, 720))
    for i in range(150):
        frame = np.full((720, 1280, 3), 40, np.uint8)
        cv2.circle(frame, (100 + i * 6, 360), 40, (200, 200, 200), -1)
        writer.write(frame)
    writer.release()
    out = analyze_video(path, str(MODEL), annotate=True, out_path=str(tmp_path / "annotated.mp4"))
    assert not out["usable"] and out["quality"]["frames"] == 150 and out["quality"]["fps"] == pytest.approx(30)
    assert os.path.getsize(tmp_path / "annotated.mp4") > 0
    small = str(tmp_path / "small.mp4")
    w = cv2.VideoWriter(small, cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
    for _ in range(10):
        w.write(np.zeros((240, 320, 3), np.uint8))
    w.release()
    with pytest.raises(FormVideoError, match="Resolution"):
        analyze_video(small, str(MODEL))

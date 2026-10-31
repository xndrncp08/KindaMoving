"""KM Form: bounded, video-based running-form *observations* (not clinical assessment).

Pose: MediaPipe Pose Landmarker (Apache-2.0), 33 normalised landmarks per frame.
Metrics (docs/FORM.md):
* Joint angles (degrees at the middle point): knee = hip-knee-ankle, hip =
  shoulder-hip-knee, elbow = shoulder-elbow-wrist. Image-plane angles: only
  meaningful from a side view with the camera level and perpendicular.
* Trunk lean: angle of the hip-mid -> shoulder-mid segment from vertical,
  positive towards the running direction (inferred from nose vs. hip x).
* Cadence: the pelvis bobs once per step; the dominant autocorrelation lag of
  the detrended pelvis height in 0.25-0.6 s gives step time -> steps/min.
  Needs >= 4 s and >= 24 fps; confidence is the autocorrelation peak.
* Step timing: foot contacts approximated as prominent local maxima of ankle
  height in image coordinates (lowest point, top 30 % of that foot's range),
  >= 0.2 s apart; contact time is NOT estimated below 100 fps.
Quality gates every number: detection rate, landmark visibility, fps, view.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

L = {
    "nose": 0, "l_eye": 2, "r_eye": 5, "l_ear": 7, "r_ear": 8, "l_shoulder": 11, "r_shoulder": 12, "l_elbow": 13, "r_elbow": 14,
    "l_wrist": 15, "r_wrist": 16, "l_hip": 23, "r_hip": 24, "l_knee": 25, "r_knee": 26, "l_ankle": 27, "r_ankle": 28,
}
SKELETON = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28), (27, 31), (28, 32)]
MAX_SECONDS = 60
MIN_VISIBILITY = 0.5

Landmarks = list[tuple[float, float, float]]  # (x, y, visibility), x/y normalised, y downwards


class FormVideoError(ValueError):
    """Video that cannot be analysed; message is user-facing."""


def angle(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n = math.hypot(*v1) * math.hypot(*v2)
    if n == 0:
        return float("nan")
    return math.degrees(math.acos(max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / n))))


def _p(lm: Landmarks, name: str) -> tuple[float, float]:
    x, y, _ = lm[L[name]]
    return x, y


def _vis(lm: Landmarks, *names: str) -> bool:
    return all(lm[L[n]][2] >= MIN_VISIBILITY for n in names)


def frame_metrics(lm: Landmarks, aspect: float = 16 / 9) -> dict:
    """Per-frame angles; x is scaled by the frame aspect so angles are geometric."""
    s = [(x * aspect, y, v) for x, y, v in lm]
    out: dict[str, float | None] = {}
    for side in ("l", "r"):
        out[f"knee_{side}"] = angle(_p(s, f"{side}_hip"), _p(s, f"{side}_knee"), _p(s, f"{side}_ankle")) if _vis(s, f"{side}_hip", f"{side}_knee", f"{side}_ankle") else None
        out[f"hip_{side}"] = angle(_p(s, f"{side}_shoulder"), _p(s, f"{side}_hip"), _p(s, f"{side}_knee")) if _vis(s, f"{side}_shoulder", f"{side}_hip", f"{side}_knee") else None
        out[f"elbow_{side}"] = angle(_p(s, f"{side}_shoulder"), _p(s, f"{side}_elbow"), _p(s, f"{side}_wrist")) if _vis(s, f"{side}_shoulder", f"{side}_elbow", f"{side}_wrist") else None
    if _vis(s, "l_shoulder", "r_shoulder", "l_hip", "r_hip"):
        sh = ((s[11][0] + s[12][0]) / 2, (s[11][1] + s[12][1]) / 2)
        hp = ((s[23][0] + s[24][0]) / 2, (s[23][1] + s[24][1]) / 2)
        direction = 1 if s[0][0] >= hp[0] else -1
        out["trunk_lean"] = math.degrees(math.atan2((sh[0] - hp[0]) * direction, hp[1] - sh[1]))
        out["pelvis_y"] = hp[1]
        out["shoulder_ratio"] = abs(s[11][0] - s[12][0]) / max(1e-6, math.hypot(sh[0] - hp[0], sh[1] - hp[1]))
    return out


def view_type(ratios: list[float]) -> str:
    """Side view when shoulders overlap in x relative to torso length."""
    if not ratios:
        return "unknown"
    r = statistics.median(ratios)
    return "side" if r < 0.35 else "front_or_back" if r > 0.6 else "oblique"


def cadence(t: list[float], y: list[float]) -> dict | None:
    if len(t) < 10 or t[-1] - t[0] < 4:
        return None
    fps = (len(t) - 1) / (t[-1] - t[0])
    if fps < 24:
        return None
    half = max(1, int(fps / 2))
    detr = [y[i] - statistics.fmean(y[max(0, i - half) : i + half + 1]) for i in range(len(y))]
    var = sum(v * v for v in detr)
    if var == 0:
        return None
    best, best_lag = -1.0, None
    for lag in range(max(1, int(0.25 * fps)), int(0.6 * fps) + 1):
        r = sum(detr[i] * detr[i + lag] for i in range(len(detr) - lag)) / var
        if r > best:
            best, best_lag = r, lag
    if best_lag is None:
        return None
    return {"steps_per_min": round(60 / (best_lag / fps), 1), "confidence": round(best, 2)}


def foot_contacts(t: list[float], ankle_y: list[float | None], min_gap_s: float = 0.2) -> list[float]:
    """Times of local maxima of ankle height in image coordinates (lowest foot position).

    Prominence gate: a swinging foot also shows small local maxima when the body
    bobs at the *other* foot's contact, so only maxima in the top 30 % of this
    foot's height range count as its own contacts.
    """
    known = sorted(v for v in ankle_y if v is not None)
    if len(known) < 10:
        return []
    floor = known[0] + 0.7 * (known[-1] - known[0])
    out = []
    for i in range(1, len(t) - 1):
        a, b, c = ankle_y[i - 1], ankle_y[i], ankle_y[i + 1]
        if None in (a, b, c) or not (b >= a and b > c) or b < floor:
            continue
        if not out or t[i] - out[-1] >= min_gap_s:
            out.append(t[i])
    return out


def _stat(values: list[float]) -> dict | None:
    v = sorted(x for x in values if x is not None and not math.isnan(x))
    if len(v) < 5:
        return None
    q = lambda p: v[min(len(v) - 1, int(p * (len(v) - 1)))]  # noqa: E731
    return {"median": round(statistics.median(v), 1), "p10": round(q(0.1), 1), "p90": round(q(0.9), 1), "n": len(v)}


@dataclass
class Series:
    t: list[float]
    landmarks: list[Landmarks | None]
    fps: float
    width: int
    height: int


def summarize(series: Series) -> dict:
    aspect = series.width / series.height if series.height else 16 / 9
    rows = [(t, frame_metrics(lm, aspect)) for t, lm in zip(series.t, series.landmarks) if lm is not None]
    detected = len(rows) / max(1, len(series.t))
    vis = [statistics.fmean(v for _, _, v in lm) for lm in series.landmarks if lm is not None]
    view = view_type([m["shoulder_ratio"] for _, m in rows if m.get("shoulder_ratio") is not None])
    warnings = []
    if series.fps < 24:
        warnings.append(f"{series.fps:.0f} fps is too low for cadence; record at 30 fps or more.")
    if series.fps < 100:
        warnings.append("Ground contact time needs 100+ fps (slow motion); it is not estimated.")
    if view != "side":
        warnings.append("Joint angles assume a side view with a level camera; this video looks " + view.replace("_", " ") + ", so angles are unreliable.")
    if detected < 0.6:
        warnings.append(f"A runner was detected in only {detected * 100:.0f}% of frames.")
    usable = detected >= 0.6 and len(rows) >= 10
    metrics: dict = {}
    if usable:
        for key in ("knee_l", "knee_r", "hip_l", "hip_r", "elbow_l", "elbow_r", "trunk_lean"):
            metrics[key] = _stat([m.get(key) for _, m in rows])
        pelvis = [(t, m["pelvis_y"]) for t, m in rows if m.get("pelvis_y") is not None]
        metrics["cadence"] = cadence([p[0] for p in pelvis], [p[1] for p in pelvis]) if pelvis else None
        contacts = []
        for side, idx in (("l", 27), ("r", 28)):
            ys = [lm[idx][1] if lm is not None and lm[idx][2] >= MIN_VISIBILITY else None for lm in series.landmarks]
            contacts += [(c, side) for c in foot_contacts(series.t, ys)]
        contacts.sort()
        steps = [b[0] - a[0] for a, b in zip(contacts, contacts[1:]) if a[1] != b[1]]
        metrics["step_time_s"] = _stat(steps)
        knee_at_contact = []
        for c, side in contacts:
            i = min(range(len(series.t)), key=lambda k: abs(series.t[k] - c))
            lm = series.landmarks[i]
            if lm is not None:
                v = frame_metrics(lm, aspect).get(f"knee_{side}")
                if v is not None:
                    knee_at_contact.append(v)
        metrics["knee_at_contact"] = _stat(knee_at_contact)
    return {
        "usable": usable,
        "metrics": metrics,
        "quality": {
            "frames": len(series.t),
            "detection_rate": round(detected, 3),
            "mean_visibility": round(statistics.fmean(vis), 3) if vis else 0.0,
            "fps": round(series.fps, 1),
            "resolution": [series.width, series.height],
            "duration_s": round(series.t[-1] - series.t[0], 1) if series.t else 0,
            "view": view,
        },
        "warnings": warnings,
        "disclaimer": "Approximate observations from a single 2-D video. Not a clinical or biomechanical assessment, and not medical advice.",
    }


def analyze_video(path: str, model_path: str, annotate: bool = True, out_path: str | None = None) -> dict:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FormVideoError("The video could not be opened. Use MP4 (H.264) or MOV.")
    fps = cap.get(cv2.CAP_PROP_FPS) or 0
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if fps <= 0 or count <= 0 or w <= 0:
        raise FormVideoError("The video has no readable frames.")
    if count / fps > MAX_SECONDS:
        raise FormVideoError(f"Videos are limited to {MAX_SECONDS} seconds; trim to a few seconds of steady running.")
    if min(w, h) < 360:
        raise FormVideoError("Resolution is too low; record at 720p or higher.")
    stride = max(1, round(fps / 60))  # analyse at most ~60 fps
    writer = None
    scale = min(1.0, 480 / h)
    if annotate and out_path:
        writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), fps / stride, (int(w * scale), int(h * scale)))
    options = PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=model_path), running_mode=RunningMode.VIDEO, num_poses=1)
    times, marks = [], []
    with PoseLandmarker.create_from_options(options) as landmarker:
        i = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if i % stride == 0:
                t = i / fps
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(t * 1000))
                lm = [(p.x, p.y, p.visibility if p.visibility is not None else 1.0) for p in result.pose_landmarks[0]] if result.pose_landmarks else None
                times.append(t)
                marks.append(lm)
                if writer is not None:
                    writer.write(_annotate(cv2, frame, lm, scale, w / h if h else 1))
            i += 1
    cap.release()
    if writer is not None:
        writer.release()
    return summarize(Series(times, marks, fps / stride, w, h))


def _annotate(cv2, frame, lm, scale, aspect):
    img = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1 else frame.copy()
    H, W = img.shape[:2]
    if lm is None:
        return img
    # Privacy: blur the head region before anything else is drawn.
    head = [lm[k] for k in (0, 2, 5, 7, 8) if lm[k][2] >= 0.3]
    if head:
        xs = [p[0] * W for p in head]
        ys = [p[1] * H for p in head]
        pad = max(20, int((max(xs) - min(xs) + max(ys) - min(ys)) * 0.8))
        x0, x1 = max(0, int(min(xs)) - pad), min(W, int(max(xs)) + pad)
        y0, y1 = max(0, int(min(ys)) - pad), min(H, int(max(ys)) + pad)
        if x1 > x0 and y1 > y0:
            img[y0:y1, x0:x1] = cv2.GaussianBlur(img[y0:y1, x0:x1], (51, 51), 0)
    for a, b in SKELETON:
        if lm[a][2] >= MIN_VISIBILITY and lm[b][2] >= MIN_VISIBILITY:
            cv2.line(img, (int(lm[a][0] * W), int(lm[a][1] * H)), (int(lm[b][0] * W), int(lm[b][1] * H)), (82, 251, 214), 2)
    m = frame_metrics(lm, aspect)
    for side, idx in (("l", 25), ("r", 26)):
        v = m.get(f"knee_{side}")
        if v is not None:
            cv2.putText(img, f"{v:.0f}", (int(lm[idx][0] * W) + 6, int(lm[idx][1] * H)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return img

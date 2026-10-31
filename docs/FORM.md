# KM Form: video-based running form observations

A **bounded** computer-vision feature. It produces approximate, single-camera 2-D observations, **not a clinical or biomechanical assessment and not medical advice**. Every result screen says so.

## Pipeline

1. The browser uploads an MP4/MOV (≤ 50 MB) directly to the private `form-videos` bucket under the user's own folder (storage RLS). `request_form_analysis` registers the path and queues a `form_analysis` job (10 per user per day).
2. The job sends the video to the analytics service (`POST /v1/form/analyze`, optional `[form]` extra: MediaPipe 1.2 + OpenCV; model `pose_landmarker_lite.task` via `FORM_MODEL_PATH`).
3. Validation: openable, readable frames, ≤ 60 s, shorter side ≥ 360 px. Frames are analysed at up to ~60 fps.
4. MediaPipe Pose Landmarker (Apache-2.0) runs in VIDEO mode and returns 33 landmarks with visibility per frame. Landmarks with visibility < 0.5 are ignored.
5. Metrics, gated by quality:
   - **Joint angles** (knee hip–knee–ankle, hip shoulder–hip–knee, elbow): image-plane angles with x scaled by frame aspect, reported as median and 10th–90th percentile across frames.
   - **Trunk lean**: hip-mid → shoulder-mid from vertical, positive toward the running direction (nose vs. hips).
   - **Cadence**: autocorrelation of the detrended pelvis height in the 0.25–0.6 s lag window (one bob per step). Needs ≥ 4 s at ≥ 24 fps, and the autocorrelation peak is reported as confidence.
   - **Step time / knee angle at contact**: contacts are prominent local maxima of ankle height in image coordinates (top 30 % of that foot's range, ≥ 0.2 s apart). The prominence gate stops the body bob at the _other_ foot's contact being misread. **Ground contact time is not estimated below 100 fps.**
6. **Quality report**: detection rate, mean visibility, fps, resolution, duration and view (side / oblique / front-or-back from shoulder width ÷ torso length). Below 60 % detection, no measurements are reported; a non-side view carries a warning that angles are unreliable.
7. **Annotated video**: skeleton and knee angles drawn on a ≤ 480p copy, with the **head region blurred** before drawing.

## Privacy and retention

- Original video: deleted immediately after analysis (success or permanent failure). It is kept only while a transient failure waits for retry.
- Annotated video: faces blurred, deleted after **7 days** by `GET /api/form/cleanup` (cron). Metrics remain until the user deletes the analysis.
- The user can delete any analysis at any time, which removes its videos immediately. Videos are private (owner-only storage policies plus short-lived signed URLs).

## Known limitations

- 2-D, single camera: angles depend on camera height, distance and perpendicularity; lens distortion and clothing affect landmarks.
- The `lite` model favours speed over accuracy. Treadmill footage at 60 fps from the side gives the most stable results.
- **Accuracy on real running footage has not been validated in this repository.** The tests cover the metric mathematics on deterministic synthetic landmark sequences (`tests/test_form.py`), plus the real MediaPipe/OpenCV video path on a generated clip without a person, which correctly reports no runner and writes the annotated output. Validating against reference measurements (e.g. a treadmill with known cadence) is a next step.

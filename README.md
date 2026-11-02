# Greeny Eyes

A pair of expressive eyes on a pistachio-green face that follow you through your
webcam. Everything runs in the browser; no video leaves your machine.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (Vite picks the next free port if taken)
npm run build    # production build in dist/
npm run preview  # serve the production build
npm test         # unit tests for the detection logic
```

The camera needs a secure context: `localhost` or HTTPS.

## What it does

| Feature | Model | Runs on |
| --- | --- | --- |
| People and 80 object classes | YOLOv8n (ONNX) | ONNX Runtime Web (WASM, in a worker) |
| Face lock on the person found | YuNet (ONNX) | ONNX Runtime Web |
| Blink / wink sync, face mesh | MediaPipe Face Landmarker | MediaPipe Tasks (GPU, CPU fallback) |
| Hand skeleton (21 points per hand, up to 2 hands) | MediaPipe Hand Landmarker | MediaPipe Tasks |

The gaze goes to the face, then the person, then the strongest object. With no
camera (or permission denied) the eyes follow the mouse. Moods (surprised,
curious, happy, sleepy), blinking and pupil dilation are driven by what is seen.

Everything is adjustable from the gear menu (models on/off, sensitivities,
colours, expression strength, preview and boxes). Settings persist in
`localStorage`.

## Layout

```
src/
  App.jsx               scene, status, dock, camera preview
  Eye.jsx               one eye: shading, lids, gaze easing, moods
  SettingsPanel.jsx     the gear menu
  settings.js           defaults + persisted settings hook
  usePersonTracker.js   camera + YOLO + YuNet loop, status machine
  useLandmarks.js       MediaPipe face + hand landmarks, blink scores
  LandmarkOverlay.jsx   draws the face mesh and hand skeleton on the preview
  CharacterHands.jsx    the character's 3D hands (three.js), driven by your hand landmarks incl. depth
  lib/detection.js      pure decode / NMS / geometry helpers (unit-tested)
public/
  models/               yolov8n-f32.onnx, yunet.onnx, face_landmarker.task,
                        hand_landmarker.task
  mp-wasm/              MediaPipe WASM runtime
```

## Model licences

- **YOLOv8n**: Ultralytics, AGPL-3.0. Check the terms before distributing a
  product that bundles it. `yolov8n-f32.onnx` is the float16 export wrapped with
  Cast nodes so it takes float32 input and output.
- **YuNet** (`face_detection_yunet_2023mar.onnx`): OpenCV Zoo, MIT.
- **MediaPipe Face Landmarker**: Google, Apache-2.0.

## Notes

- Inference runs on the CPU (WASM, single thread), so expect a modest frame
  rate; the eyes ease toward each new target so movement stays smooth.
- Detection pauses while the tab is hidden.

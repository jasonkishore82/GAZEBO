import { useCallback, useEffect, useRef, useState } from 'react'
import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import mjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import { INPUT, decodeYolo, decodeYuNet, toYoloInput, toYuNetInput } from './lib/detection.js'
import { FACE_SIZE, averageEmbeddings, matchFace, normalize, similarityTransform } from './lib/faces.js'

ort.env.wasm.wasmPaths = { mjs: mjsUrl, wasm: wasmUrl }
ort.env.wasm.numThreads = 1
// run inference in ORT's own worker so the page stays responsive
ort.env.wasm.proxy = true

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Sessions are created once per page load and reused across retries.
let modelsPromise
function loadModels() {
  if (!modelsPromise) {
    const opts = { executionProviders: ['wasm'] }
    modelsPromise = Promise.all([
      ort.InferenceSession.create('/models/yolov8n-f32.onnx', opts),
      ort.InferenceSession.create('/models/yunet.onnx', opts),
    ]).catch((e) => {
      modelsPromise = undefined
      throw e
    })
  }
  return modelsPromise
}

// The recognition model (SFace) loads on its own so a slow download never
// delays tracking; recognition simply starts once it is ready.
let sfacePromise
function loadSface() {
  if (!sfacePromise) {
    sfacePromise = ort.InferenceSession.create('/models/sface.onnx', { executionProviders: ['wasm'] }).catch((e) => {
      sfacePromise = undefined
      throw e
    })
  }
  return sfacePromise
}

// 128-number identity vector for the face with the given landmarks: the face
// is rotated and scaled to the standard 112x112 pose, then run through SFace.
async function embedFace(session, video, kps, ctx) {
  const [a, b, tx, ty] = similarityTransform(kps)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, FACE_SIZE, FACE_SIZE)
  ctx.setTransform(a, b, -b, a, tx, ty)
  ctx.drawImage(video, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const { data } = ctx.getImageData(0, 0, FACE_SIZE, FACE_SIZE)
  const n = FACE_SIZE * FACE_SIZE
  const input = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    input[i] = data[i * 4] // RGB, 0..255
    input[n + i] = data[i * 4 + 1]
    input[2 * n + i] = data[i * 4 + 2]
  }
  const out = await session.run({ data: new ort.Tensor('float32', input, [1, 3, FACE_SIZE, FACE_SIZE]) })
  return normalize(out.fc1.data)
}

// Small mirrored square JPEG of the face, for the faces list.
function faceThumbnail(video, box) {
  const size = Math.max(box.w, box.h) * 1.6
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  g.translate(96, 0)
  g.scale(-1, 1)
  g.drawImage(video, box.x + box.w / 2 - size / 2, box.y + box.h / 2 - size / 2, size, size, 0, 0, 96, 96)
  return c.toDataURL('image/jpeg', 0.82)
}

// Draws the source rect (sx, sy, sw, sh) of the video letterboxed into the
// INPUT x INPUT canvas and returns the pixels plus the placement used.
function letterbox(ctx, video, sx, sy, sw, sh) {
  const scale = Math.min(INPUT / sw, INPUT / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (INPUT - dw) / 2
  const dy = (INPUT - dh) / 2
  ctx.fillStyle = '#727272'
  ctx.fillRect(0, 0, INPUT, INPUT)
  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)
  const { data } = ctx.getImageData(0, 0, INPUT, INPUT)
  return { data, scale, dx, dy }
}

function describeCameraError(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { state: 'denied', message: 'Camera access is blocked' }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { state: 'nocamera', message: 'No camera found' }
    case 'NotReadableError':
      return { state: 'nocamera', message: 'Camera is in use by another app' }
    default:
      return { state: 'error', message: e?.message || 'Something went wrong' }
  }
}

// Finds objects (and the person) with YOLOv8n, then refines to their face with
// YuNet. Models and thresholds come from `settings` (yolo, yunet, objectConf,
// faceConf, onlyPeople) and can change while it runs.
//
// Returns:
//   target  null, or { x, y, objects, face } with normalized (0..1) video
//           coordinates; `x`,`y` is the point to look at
//   status  { state: loading | camera | tracking | denied | nocamera | error, message }
//   fps     inference rate
//   retry   restart after a failure
export function usePersonTracker(settings, faces = []) {
  const videoRef = useRef(null)
  const cfgRef = useRef(settings)
  cfgRef.current = settings
  const facesRef = useRef(faces)
  facesRef.current = faces
  const captureRef = useRef(null)
  const [identity, setIdentity] = useState(null) // { id, score } of the recognised saved face
  const [target, setTarget] = useState(null)
  const [status, setStatus] = useState({ state: 'loading', message: 'Loading models' })
  const [fps, setFps] = useState(0)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  // Takes a few samples of the face in front of the camera and resolves with
  // their average embedding and a thumbnail. Rejects if no face turns up.
  const captureFace = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!cfgRef.current.yunet) return reject(new Error('Turn on YuNet (face lock) in settings to add a face.'))
        captureRef.current?.reject(new Error('Cancelled'))
        captureRef.current = { samples: [], resolve, reject, deadline: performance.now() + 15000, lastAt: 0, thumb: null }
      }),
    []
  )

  useEffect(() => {
    let stopped = false
    let stream

    async function run() {
      setStatus({ state: 'loading', message: 'Loading models' })
      let yolo, yunet
      try {
        ;[yolo, yunet] = await loadModels()
      } catch (e) {
        console.error(e)
        if (!stopped) setStatus({ state: 'error', message: 'Could not load the detection models' })
        return
      }
      if (stopped) return

      try {
        setStatus({ state: 'camera', message: 'Waiting for camera permission' })
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        video.srcObject = stream
        await video.play().catch(() => {})
        if (!video.videoWidth) {
          await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }))
        }
        setStatus({ state: 'tracking', message: 'Tracking' })
      } catch (e) {
        console.warn('Camera unavailable:', e)
        if (!stopped) setStatus(describeCameraError(e))
        return
      }

      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = INPUT
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const video = videoRef.current
        const faceCtx = Object.assign(document.createElement('canvas'), { width: FACE_SIZE, height: FACE_SIZE }).getContext('2d', {
          willReadFrequently: true,
        })
        const rec = { at: 0, id: null, pending: null, seenAt: 0 }
        let sface = null
        loadSface().then((s) => (sface = s), (e) => console.warn('Face recognition unavailable:', e))
        let frames = 0
        let windowStart = performance.now()

        while (!stopped) {
          const cfg = cfgRef.current
          if (document.hidden || (!cfg.yolo && !cfg.yunet)) {
            setTarget(null)
            setFps(0)
            await sleep(200)
            windowStart = performance.now()
            frames = 0
            continue
          }

          const vw = video.videoWidth
          const vh = video.videoHeight

          // 1. YOLO: objects and the person, across the whole frame
          let objects = []
          if (cfg.yolo) {
            const lb = letterbox(ctx, video, 0, 0, vw, vh)
            const out = await yolo.run({
              images: new ort.Tensor('float32', toYoloInput(lb.data), [1, 3, INPUT, INPUT]),
            })
            objects = decodeYolo(out.output0.data, cfg, lb)
          }
          const person = objects.find((d) => d.cls === 0) || null

          // 2. YuNet: a face in the person's upper body (or the whole frame)
          let face = null
          if (cfg.yunet) {
            let sx = 0
            let sy = 0
            let sw = vw
            let sh = vh
            if (person) {
              sx = Math.max(0, person.x)
              sy = Math.max(0, person.y)
              sw = Math.max(32, Math.min(vw - sx, person.w))
              sh = Math.max(32, Math.min(vh - sy, person.h * 0.5))
            }
            const fb = letterbox(ctx, video, sx, sy, sw, sh)
            const out = await yunet.run({
              input: new ort.Tensor('float32', toYuNetInput(fb.data), [1, 3, INPUT, INPUT]),
            })
            const f = decodeYuNet(out, cfg.faceConf)
            face = f && {
              x: sx + (f.x - fb.dx) / fb.scale,
              y: sy + (f.y - fb.dy) / fb.scale,
              w: f.w / fb.scale,
              h: f.h / fb.scale,
              score: f.score,
              kps: f.kps?.map(([kx, ky]) => [sx + (kx - fb.dx) / fb.scale, sy + (ky - fb.dy) / fb.scale]),
            }
          }

          // 3. SFace: who is it? Matches against the saved faces a couple of
          // times a second, and takes capture samples when adding a face.
          const nowMs = performance.now()
          const cap = captureRef.current
          if (cap && nowMs > cap.deadline) {
            captureRef.current = null
            cap.reject(new Error('No clear face found. Look at the camera and try again.'))
          }
          if (face?.kps && sface) {
            rec.seenAt = nowMs
            const capturing = captureRef.current && face.score >= 0.7 && nowMs - captureRef.current.lastAt > 220
            const due = cfg.recognize && nowMs - rec.at > 500 && facesRef.current.length > 0
            if (capturing || due) {
              const emb = await embedFace(sface, video, face.kps, faceCtx)
              if (capturing && captureRef.current) {
                const c = captureRef.current
                c.lastAt = nowMs
                c.samples.push(emb)
                c.thumb = faceThumbnail(video, face)
                if (c.samples.length >= 5) {
                  captureRef.current = null
                  c.resolve({ embedding: averageEmbeddings(c.samples), thumbnail: c.thumb })
                }
              }
              if (due) {
                rec.at = nowMs
                const m = matchFace(emb, facesRef.current)
                const id = m ? m.id : null
                // the identity only changes after the same new result twice in a row
                if (id === rec.id) rec.pending = undefined
                else if (rec.pending === id) {
                  rec.id = id
                  rec.pending = undefined
                  setIdentity(m ? { id: m.id, score: m.score } : null)
                } else rec.pending = id
              }
            }
          } else if (rec.id && nowMs - rec.seenAt > 3000) {
            rec.id = null
            rec.pending = undefined
            setIdentity(null)
          }

          frames++
          const now = performance.now()
          if (now - windowStart >= 1000) {
            setFps(Math.round((frames * 1000) / (now - windowStart)))
            frames = 0
            windowStart = now
          }

          if (objects.length === 0 && !face) {
            setTarget(null)
            continue
          }

          const norm = (b) => b && { ...b, x: b.x / vw, y: b.y / vh, w: b.w / vw, h: b.h / vh }
          const objs = objects.map(norm)
          const p = norm(person)
          const fc = norm(face)
          // prefer the face, then the person's upper body, then the strongest object
          let aim
          if (fc) aim = { x: fc.x + fc.w / 2, y: fc.y + fc.h / 2 }
          else if (p) aim = { x: p.x + p.w / 2, y: p.y + p.h * 0.2 }
          else aim = { x: objs[0].x + objs[0].w / 2, y: objs[0].y + objs[0].h / 2 }
          setTarget({ ...aim, objects: objs, face: fc })
        }
      } catch (e) {
        console.error(e)
        if (!stopped) setStatus({ state: 'error', message: 'Detection stopped unexpectedly' })
      }
    }

    run()
    return () => {
      stopped = true
      captureRef.current?.reject(new Error('Camera stopped'))
      captureRef.current = null
      stream?.getTracks().forEach((t) => t.stop())
      setTarget(null)
    }
  }, [attempt])

  return { videoRef, target, status, fps, retry, identity, captureFace }
}

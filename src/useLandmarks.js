import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

// MediaPipe landmarks for the user, from the shared webcam <video>.
//
//   face   run the Face Landmarker (blink scores and the face mesh)
//   hands  run the Hand Landmarker
//
// Returns:
//   blink   { left, right } blink scores (0 open .. 1 closed), or null. The
//           preview is mirrored, so the user's left eye drives the left eye
//           on screen.
//   hand    { x, y } normalized video position of the first hand, or null
//   marks   ref to { face: points[] | null, hands: points[][] } holding the
//           latest landmarks. A ref, not state, so drawing them every frame
//           doesn't re-render the app.
export function useLandmarks(videoRef, { face, hands }) {
  const [blink, setBlink] = useState(null)
  const [hand, setHand] = useState(null)
  const marks = useRef({ face: null, hands: [] })

  useEffect(() => {
    if (!face && !hands) {
      marks.current = { face: null, hands: [] }
      setBlink(null)
      setHand(null)
      return
    }

    let stopped = false
    let raf
    const models = []

    async function run() {
      try {
        const fileset = await FilesetResolver.forVisionTasks('/mp-wasm')
        const make = async (Klass, path, extra) => {
          const create = (delegate) =>
            Klass.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: path, delegate },
              runningMode: 'VIDEO',
              ...extra,
            })
          // GPU where available, CPU otherwise
          const m = await create('GPU').catch(() => create('CPU'))
          models.push(m)
          return m
        }

        const faceModel = face
          ? await make(FaceLandmarker, '/models/face_landmarker.task', {
              numFaces: 1,
              outputFaceBlendshapes: true,
            })
          : null
        const handModel = hands
          ? await make(HandLandmarker, '/models/hand_landmarker.task', { numHands: 2 })
          : null
        if (stopped) return

        let lastTime = -1
        let lastBlink = null
        let lastHand = null

        const tick = () => {
          if (stopped) return
          const video = videoRef.current
          if (video && video.readyState >= 2 && video.currentTime !== lastTime) {
            lastTime = video.currentTime
            const now = performance.now()

            if (faceModel) {
              const res = faceModel.detectForVideo(video, now)
              marks.current.face = res.faceLandmarks?.[0] ?? null
              const shapes = res.faceBlendshapes?.[0]?.categories
              let next = null
              if (shapes) {
                const score = (name) => shapes.find((c) => c.categoryName === name)?.score ?? 0
                next = { left: score('eyeBlinkLeft'), right: score('eyeBlinkRight') }
              }
              const changed =
                !!next !== !!lastBlink ||
                (next &&
                  (Math.abs(next.left - lastBlink.left) > 0.02 ||
                    Math.abs(next.right - lastBlink.right) > 0.02))
              if (changed) {
                lastBlink = next
                setBlink(next)
              }
            }

            if (handModel) {
              const res = handModel.detectForVideo(video, now)
              marks.current.hands = res.landmarks ?? []
              // landmark 9 (middle-finger base) sits near the palm centre
              const p = res.landmarks?.[0]?.[9]
              const next = p ? { x: p.x, y: p.y } : null
              const changed =
                !!next !== !!lastHand ||
                (next && (Math.abs(next.x - lastHand.x) > 0.01 || Math.abs(next.y - lastHand.y) > 0.01))
              if (changed) {
                lastHand = next
                setHand(next)
              }
            }
          }
          raf = requestAnimationFrame(tick)
        }
        tick()
      } catch (e) {
        console.error('MediaPipe landmarks unavailable:', e)
      }
    }

    run()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      models.forEach((m) => m.close())
      marks.current = { face: null, hands: [] }
    }
  }, [videoRef, face, hands])

  return { blink: face ? blink : null, hand: hands ? hand : null, marks }
}

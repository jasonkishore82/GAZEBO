import { useEffect, useRef } from 'react'
import { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision'

const FACE_LINES = FaceLandmarker.FACE_LANDMARKS_CONTOURS
const HAND_LINES = HandLandmarker.HAND_CONNECTIONS
const FINGERTIPS = new Set([4, 8, 12, 16, 20])

// Draws the latest MediaPipe landmarks over the camera preview. It runs its
// own animation loop and reads from a ref, so it never re-renders the app.
// The preview is mirrored, so x is flipped.
export default function LandmarkOverlay({ marks, faceOn, handsOn }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const px = (p) => [(1 - p.x) * w, p.y * h]

      const { face, hands } = marks.current

      if (faceOn && face) {
        ctx.strokeStyle = 'rgba(255, 213, 74, 0.75)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const { start, end } of FACE_LINES) {
          const [x1, y1] = px(face[start])
          const [x2, y2] = px(face[end])
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
        }
        ctx.stroke()
      }

      if (handsOn) {
        for (const hand of hands) {
          ctx.strokeStyle = 'rgba(80, 200, 255, 0.9)'
          ctx.lineWidth = 2
          ctx.beginPath()
          for (const { start, end } of HAND_LINES) {
            const [x1, y1] = px(hand[start])
            const [x2, y2] = px(hand[end])
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
          }
          ctx.stroke()
          hand.forEach((p, i) => {
            const [x, y] = px(p)
            ctx.fillStyle = FINGERTIPS.has(i) ? '#ff5d8f' : '#fff'
            ctx.beginPath()
            ctx.arc(x, y, FINGERTIPS.has(i) ? 3.2 : 2.2, 0, Math.PI * 2)
            ctx.fill()
          })
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [marks, faceOn, handsOn])

  return <canvas ref={canvasRef} className="landmarks" aria-hidden="true" />
}

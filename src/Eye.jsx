import { useEffect, useId, useRef, useState } from 'react'

const SIZE = 310
const R = SIZE / 2 // sclera radius
const IRIS_R = 84
const MAX_OFFSET = R - IRIS_R - 6 // how far the iris can travel
const ORIGIN = `${R}px ${R}px`

// Each mood is a pose for the lids and pupil.
//   upper/lower: how far the lid is closed (0 open .. 1 shut)
//   tilt: lid angle in degrees (mirrored per eye)
//   pupil: pupil scale, iris: iris scale
const MOODS = {
  idle: { upper: 0.08, lower: 0, tilt: 0, pupil: 1, iris: 1 },
  curious: { upper: 0, lower: 0.04, tilt: -7, pupil: 1.15, iris: 1.03 },
  happy: { upper: 0.1, lower: 0.28, tilt: -4, pupil: 1.35, iris: 1.05 },
  surprised: { upper: -0.12, lower: 0, tilt: 0, pupil: 0.55, iris: 1.08 },
  sleepy: { upper: 0.5, lower: 0.05, tilt: 5, pupil: 0.9, iris: 1 },
}

const EASE = '260ms cubic-bezier(0.25, 0.8, 0.25, 1)'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = (e) => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

// `look` is a screen point to watch. `sync` is how shut the user's eye is
// (0..1), or null to blink on our own. `expression` scales how far moods pull
// the face away from idle.
export default function Eye({ look, mood = 'idle', side = 1, sync = null, expression = 1 }) {
  const uid = useId().replace(/:/g, '')
  const ref = useRef(null)
  const irisRef = useRef(null)
  const goal = useRef({ x: -60, y: 0, s: 1 })
  const reduced = usePrefersReducedMotion()
  const [blink, setBlink] = useState(false)
  const [jitter, setJitter] = useState({ x: 0, y: 0 })

  // Random blinking; sleepy eyes blink slower and less often.
  useEffect(() => {
    if (sync !== null) return
    let timer
    let inner
    const schedule = () => {
      const base = mood === 'sleepy' ? 5000 : 2200
      timer = setTimeout(() => {
        setBlink(true)
        inner = setTimeout(() => setBlink(false), mood === 'sleepy' ? 260 : 130)
        schedule()
      }, base + Math.random() * 3000)
    }
    schedule()
    return () => {
      clearTimeout(timer)
      clearTimeout(inner)
    }
  }, [mood, sync !== null])

  // Glide the iris toward its goal every display frame. Detections only
  // arrive a few times a second, so easing here is what keeps it smooth.
  useEffect(() => {
    const cur = { ...goal.current }
    let last = performance.now()
    let raf
    const tick = (now) => {
      const k = 1 - Math.exp(-(now - last) / 110)
      last = now
      const g = goal.current
      cur.x += (g.x - cur.x) * k
      cur.y += (g.y - cur.y) * k
      cur.s += (g.s - cur.s) * k
      if (irisRef.current) {
        irisRef.current.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) scale(${cur.s})`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Tiny eye darts so the gaze never looks frozen.
  useEffect(() => {
    if (reduced) {
      setJitter({ x: 0, y: 0 })
      return
    }
    const id = setInterval(() => {
      setJitter({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 6 })
    }, 900)
    return () => clearInterval(id)
  }, [reduced])

  const target = MOODS[mood] || MOODS.idle
  const pose = Object.fromEntries(
    Object.keys(MOODS.idle).map((k) => [k, MOODS.idle[k] + (target[k] - MOODS.idle[k]) * expression])
  )

  // Aim the iris toward the look point from this eye's centre. The scene is
  // scaled, so measure in the eye's own units.
  let x = -60
  let y = 0
  if (look && ref.current) {
    const rect = ref.current.getBoundingClientRect()
    const unit = rect.width / SIZE || 1
    const dx = (look.x - (rect.left + rect.width / 2)) / unit
    const dy = (look.y - (rect.top + rect.height / 2)) / unit
    const dist = Math.hypot(dx, dy) || 1
    const m = Math.min(MAX_OFFSET, dist)
    x = (dx / dist) * m
    y = (dy / dist) * m
  }
  goal.current = { x: x + jitter.x, y: y + jitter.y, s: pose.iris }

  // synced: the lid follows the user's eye
  const synced = sync !== null
  const upper = synced ? pose.upper + (1 - pose.upper) * sync : blink ? 1 : pose.upper
  const lidMs = synced || blink ? '70ms' : EASE
  const lidTransition = reduced ? 'none' : `transform ${lidMs}`
  const moodTransition = reduced ? 'none' : `transform ${EASE}`
  const lidEdge = 'color-mix(in srgb, var(--face) 62%, black)'
  const id = (n) => `${n}-${uid}`

  return (
    <svg
      ref={ref}
      className="eye"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      shapeRendering="geometricPrecision"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id('clip')}>
          <circle cx={R} cy={R} r={R} />
        </clipPath>

        {/* eyeball: bright centre falling off to a soft, slightly warm edge */}
        <radialGradient id={id('sclera')} cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#f6f4f8" />
          <stop offset="100%" stopColor="#e3dde0" />
        </radialGradient>

        {/* iris: light inside, deeper toward the rim */}
        <radialGradient id={id('iris')} cx="50%" cy="46%" r="52%">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--iris) 70%, white)' }} />
          <stop offset="45%" style={{ stopColor: 'var(--iris)' }} />
          <stop offset="88%" style={{ stopColor: 'color-mix(in srgb, var(--iris) 72%, black)' }} />
          <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--iris) 52%, black)' }} />
        </radialGradient>

        <radialGradient id={id('pupil')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--iris) 30%, black)' }} />
          <stop offset="100%" style={{ stopColor: 'color-mix(in srgb, var(--iris) 52%, black)' }} />
        </radialGradient>

        <radialGradient id={id('shine')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0.96" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.7" />
        </radialGradient>

        {/* soft shadow the lids cast onto the eyeball */}
        <linearGradient id={id('shadow-top')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2a18" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#1c2a18" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('shadow-bottom')} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#1c2a18" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#1c2a18" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* eyeball */}
      <circle cx={R} cy={R} r={R} fill={`url(#${id('sclera')})`} />

      <g clipPath={`url(#${id('clip')})`}>
        <g ref={irisRef} style={{ transformOrigin: ORIGIN, willChange: 'transform' }}>
          <circle cx={R} cy={R} r={IRIS_R} fill={`url(#${id('iris')})`} />
          {/* fine ring where iris meets sclera */}
          <circle
            cx={R}
            cy={R}
            r={IRIS_R - 1}
            fill="none"
            strokeWidth="2"
            style={{ stroke: 'color-mix(in srgb, var(--iris) 40%, black)', opacity: 0.55 }}
          />
          {/* pupil dilates with mood */}
          <circle
            cx={R}
            cy={R}
            r={29}
            fill={`url(#${id('pupil')})`}
            style={{ transform: `scale(${pose.pupil})`, transformOrigin: ORIGIN, transition: moodTransition }}
          />
          {/* glossy highlights */}
          <circle cx={R - IRIS_R * 0.55} cy={R + IRIS_R * 0.48} r={24} fill={`url(#${id('shine')})`} />
          <circle cx={R + IRIS_R * 0.34} cy={R - IRIS_R * 0.42} r={8} fill="#fff" opacity="0.85" />
        </g>

        {/* upper lid */}
        <g
          style={{
            transform: `rotate(${pose.tilt * side}deg) translateY(${upper * SIZE}px)`,
            transformOrigin: ORIGIN,
            transition: lidTransition,
          }}
        >
          <rect x={-SIZE} y={-SIZE} width={SIZE * 3} height={SIZE} style={{ fill: 'var(--face)' }} />
          <rect x={-SIZE} y={0} width={SIZE * 3} height={46} fill={`url(#${id('shadow-top')})`} />
          <line x1={-SIZE} x2={SIZE * 2} y1={0} y2={0} strokeWidth="3" style={{ stroke: lidEdge }} />
        </g>

        {/* lower lid (rises when smiling) */}
        <g
          style={{
            transform: `rotate(${-pose.tilt * side * 0.5}deg) translateY(${-pose.lower * SIZE}px)`,
            transformOrigin: ORIGIN,
            transition: moodTransition,
          }}
        >
          <rect x={-SIZE} y={SIZE} width={SIZE * 3} height={SIZE} style={{ fill: 'var(--face)' }} />
          <rect x={-SIZE} y={SIZE - 34} width={SIZE * 3} height={34} fill={`url(#${id('shadow-bottom')})`} />
          <line x1={-SIZE} x2={SIZE * 2} y1={SIZE} y2={SIZE} strokeWidth="3" style={{ stroke: lidEdge }} />
        </g>
      </g>

      {/* crisp rim to separate the eye from the face */}
      <circle
        cx={R}
        cy={R}
        r={R - 0.75}
        fill="none"
        strokeWidth="1.5"
        style={{ stroke: 'color-mix(in srgb, var(--face) 50%, black)', opacity: 0.35 }}
      />
    </svg>
  )
}

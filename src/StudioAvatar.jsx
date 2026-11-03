import { useEffect, useId, useRef } from 'react'

// The "Studio" avatar: a ceramic head with a black glass screen. Two luminous
// eyes and a thin mouth are drawn on the glass. A rAF loop eases every shape
// toward the current mood and writes SVG attributes directly, so the face moves
// smoothly without re-rendering React.

const EYE_X = 122 // eye centre, left/right of the screen centre (SVG units)
const EYE_Y = -30
const MOUTH_Y = 108
const VB = { x: -300, y: -207, w: 600, h: 414 }

//        width  height  lid (0 open..1 shut)  cut (happy arch 0..1)  tilt
const EYES = {
  idle: { w: 78, h: 132, lid: 0, cut: 0, tilt: 0 },
  curious: { w: 80, h: 142, lid: 0, cut: 0, tilt: 6 },
  happy: { w: 88, h: 112, lid: 0, cut: 0.66, tilt: 0 },
  surprised: { w: 94, h: 170, lid: 0, cut: 0, tilt: 0 },
  sleepy: { w: 80, h: 126, lid: 0.46, cut: 0, tilt: -4 },
  asleep: { w: 86, h: 120, lid: 0.95, cut: 0, tilt: 0 },
}

//          smile  open  half-width  arch  skew
const MOUTHS = {
  idle: { smile: 0.55, open: 0, w: 46, arch: 0, skew: 0 },
  curious: { smile: 0.2, open: 0, w: 36, arch: 0, skew: 0.7 },
  happy: { smile: 1, open: 0.5, w: 74, arch: 0, skew: 0 },
  surprised: { smile: 0, open: 0.9, w: 24, arch: 1, skew: 0 },
  sleepy: { smile: 0.05, open: 0, w: 32, arch: 0, skew: 0 },
  asleep: { smile: 0.1, open: 0.12, w: 28, arch: 0.4, skew: 0 },
  talking: { smile: 0.5, open: 0.2, w: 54, arch: 0.2, skew: 0 },
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const f = (n) => n.toFixed(2)

function mouthPath(p) {
  const lift = p.smile * 16
  const yL = -lift + p.skew * 6
  const yR = -lift - p.skew * 6
  const ym = (yL + yR) / 2
  const D = p.open * 52
  const up = ym + p.smile * 9 - p.arch * p.open * 22
  const low = ym + p.smile * 9 + D * 1.3
  const w = p.w
  return (
    `M${f(-w)} ${f(yL)}C${f(-w * 0.5)} ${f(up)} ${f(w * 0.5)} ${f(up)} ${f(w)} ${f(yR)}` +
    `C${f(w * 0.85)} ${f(low)} ${f(-w * 0.85)} ${f(low)} ${f(-w)} ${f(yL)}Z`
  )
}

// Moves every numeric field of `cur` toward `target` (exponential easing).
function ease(cur, target, k) {
  for (const key in cur) cur[key] += (target[key] - cur[key]) * k
}

export default function StudioAvatar({ look, mood, mouthMood, contact, expression, syncLeft, syncRight, levelRef }) {
  const uid = useId().replace(/:/g, '')
  const svgRef = useRef(null)
  const refs = useRef({})
  const props = useRef({})
  props.current = { look, mood, mouthMood, contact, expression, syncLeft, syncRight, levelRef }
  const ref = (name) => (node) => {
    refs.current[name] = node
  }

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const eyes = [-1, 1].map(() => ({ ...EYES.idle, gx: 0, gy: 0, blink: 0 }))
    const mouth = { ...MOUTHS.idle }
    let last = performance.now()
    let nextBlink = last + 1800 + Math.random() * 2500
    let blinkUntil = 0
    let jitterAt = 0
    let jitter = { x: 0, y: 0 }
    let raf

    const frame = (now) => {
      const dt = Math.min(now - last, 100)
      last = now
      const p = props.current
      const r = refs.current
      const k = 1 - Math.exp(-dt / 110)
      const kGaze = 1 - Math.exp(-dt / 80)

      // --- pose for this mood, scaled by the expressiveness setting ---
      const base = EYES.idle
      const target = EYES[p.mood] || base
      const ex = p.mood === 'asleep' ? 1 : p.expression ?? 1
      const goal = {}
      for (const key of ['w', 'h', 'lid', 'cut', 'tilt']) goal[key] = base[key] + (target[key] - base[key]) * ex

      // --- blinking: on its own, or following the user's eyes ---
      if (!reduced && now > nextBlink) {
        blinkUntil = now + 120
        nextBlink = now + 2200 + Math.random() * 3200
      }
      const autoBlink = now < blinkUntil ? 1 : 0

      // --- where to look ---
      if (now - jitterAt > 900) {
        jitterAt = now
        jitter = reduced ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 4 }
      }
      const svg = svgRef.current
      const box = svg?.getBoundingClientRect()
      const scale = box ? Math.min(box.width / VB.w, box.height / VB.h) || 1 : 1
      const cx = box ? box.left + box.width / 2 : 0
      const cy = box ? box.top + box.height / 2 : 0

      eyes.forEach((e, i) => {
        const side = i === 0 ? -1 : 1
        ease(e, { ...goal, gx: e.gx, gy: e.gy, blink: e.blink }, k)

        const sync = side === -1 ? p.syncLeft : p.syncRight
        const blinkTarget = sync != null ? sync : autoBlink
        e.blink += (blinkTarget - e.blink) * (1 - Math.exp(-dt / (sync != null ? 35 : 45)))

        let tx = 0
        let ty = 0
        if (p.look && box) {
          const ecx = cx + (side * EYE_X) * scale
          const ecy = cy + EYE_Y * scale
          const dx = (p.look.x - ecx) / scale
          const dy = (p.look.y - ecy) / scale
          const dist = Math.hypot(dx, dy) || 1
          const m = 30 * Math.tanh(dist / 260)
          tx = (dx / dist) * m
          ty = (dy / dist) * m * 0.8
        }
        // eye contact: settle on the viewer, each eye a touch inward
        const c = p.contact || 0
        tx += (-side * 5 - tx) * c
        ty += (0 - ty) * c
        e.gx += (tx + jitter.x - e.gx) * kGaze
        e.gy += (ty + jitter.y - e.gy) * kGaze

        // --- write the shapes ---
        const lid = clamp(Math.max(e.lid, e.blink), 0, 0.97)
        const hh = e.h / 2
        const group = r[`eye${i}`]
        const pill = r[`pill${i}`]
        const lidRect = r[`lid${i}`]
        const cut = r[`cut${i}`]
        if (!group) return
        group.setAttribute('transform', `translate(${f(side * EYE_X + e.gx)} ${f(EYE_Y + e.gy)})`)
        pill.setAttribute('x', f(-e.w / 2))
        pill.setAttribute('y', f(-hh))
        pill.setAttribute('width', f(e.w))
        pill.setAttribute('height', f(e.h))
        pill.setAttribute('rx', f(e.w / 2))
        // lid: a dark slab from the top down to lid * height, tilted per eye
        const edge = -hh + lid * e.h
        lidRect.setAttribute('y', f(-260))
        lidRect.setAttribute('height', f(edge + 260))
        lidRect.setAttribute('transform', `rotate(${f(e.tilt * side)} 0 ${f(edge)})`)
        // cutter: an ellipse that bites the bottom of the eye into an arch (happy)
        const ry = e.h * 0.62
        cut.setAttribute('cx', 0)
        cut.setAttribute('cy', f(hh + ry * (1 - clamp(e.cut, 0, 1) * 0.95)))
        cut.setAttribute('rx', f(e.w * 0.85))
        cut.setAttribute('ry', f(ry))
      })

      // --- mouth: eases to the mood; while talking it follows the voice level ---
      const mt = { ...(MOUTHS[p.mouthMood] || MOUTHS.idle) }
      if (p.mouthMood === 'talking') {
        const lv = Math.sqrt(p.levelRef?.current || 0)
        mt.open = 0.04 + lv * 1.05
        mt.w = 58 - lv * 12
        mt.arch = 0.2 + lv * 0.5
      }
      ease(mouth, mt, 1 - Math.exp(-dt / (p.mouthMood === 'talking' ? 40 : 110)))
      const d = mouthPath(mouth)
      r.mouth?.setAttribute('d', d)
      if (r.mouth) r.mouth.style.fillOpacity = clamp(mouth.open * 7, 0, 1)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="studio-head">
      <div className="studio-shell">
        <i className="studio-cam" />
        <div className="studio-screen">
          <svg
            ref={svgRef}
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              {[0, 1].map((i) => (
                <mask key={i} id={`${uid}-m${i}`} maskUnits="userSpaceOnUse" x="-200" y="-260" width="400" height="520">
                  <rect x="-200" y="-260" width="400" height="520" fill="#fff" />
                  <rect ref={ref(`lid${i}`)} x="-200" width="400" fill="#000" />
                  <ellipse ref={ref(`cut${i}`)} fill="#000" />
                </mask>
              ))}
            </defs>
            <g className="studio-face">
              {[0, 1].map((i) => (
                <g key={i} ref={ref(`eye${i}`)} className="studio-eye">
                  <g mask={`url(#${uid}-m${i})`}>
                    <rect ref={ref(`pill${i}`)} className="studio-glow" />
                  </g>
                </g>
              ))}
              <g transform={`translate(0 ${MOUTH_Y})`}>
                <path ref={ref('mouth')} className="studio-line" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}

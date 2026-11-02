import { useEffect, useId, useRef } from 'react'

// A soft cartoon mouth with a reddish-pink tongue. Each mood is a handful of
// numbers; a rAF loop eases the current shape toward them and writes the SVG
// paths directly, so the mouth morphs smoothly without re-rendering React.

const POSES = {
  //          smile  open  width  arch  tongue skew
  idle:      { smile: 0.95, open: 0,    w: 75, arch: 0,   tongue: 0,    skew: 0 },
  curious:   { smile: 0.35, open: 0.08, w: 65, arch: 0,   tongue: 0,    skew: 0.7 },
  happy:     { smile: 1,    open: 1,    w: 104, arch: 0,   tongue: 1,    skew: 0 },
  surprised: { smile: 0,    open: 0.95, w: 32, arch: 1,   tongue: 0.35, skew: 0 },
  talking:   { smile: 0.5,  open: 0.2,  w: 70, arch: 0.3, tongue: 0.7,  skew: 0 },
  asleep:    { smile: 0.1,  open: 0.1,  w: 40, arch: 0.6, tongue: 0,    skew: 0 },
  sleepy:    { smile: 0.15, open: 0.12, w: 55, arch: 0,   tongue: 0,    skew: -0.2 },
}

const LIP = '#4a1b22'
const INSIDE = '#5b1626'
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const f = (n) => n.toFixed(2)

// Closed outline of the mouth for the current pose.
function mouthPath(p) {
  const lift = p.smile * 13
  const yL = -lift + p.skew * 8
  const yR = -lift - p.skew * 8
  const ym = (yL + yR) / 2
  const D = p.open * 74
  const up = ym + p.smile * 9 - p.arch * p.open * 30
  const low = ym + p.smile * 9 + D * 1.3
  const w = p.w
  return (
    `M${f(-w)} ${f(yL)}C${f(-w * 0.5)} ${f(up)} ${f(w * 0.5)} ${f(up)} ${f(w)} ${f(yR)}` +
    `C${f(w * 0.85)} ${f(low)} ${f(-w * 0.85)} ${f(low)} ${f(-w)} ${f(yL)}Z`
  )
}

export default function Mouth({ look, mood, levelRef }) {
  const id = useId().replace(/:/g, '')
  const moodRef = useRef(mood)
  const lookRef = useRef(look)
  moodRef.current = mood
  lookRef.current = look

  const el = useRef({})

  useEffect(() => {
    const cur = { ...POSES.idle }
    let last = performance.now()
    let raf

    const frame = (now) => {
      const dt = Math.min(now - last, 100)
      last = now
      let target = POSES[moodRef.current] || POSES.idle
      if (moodRef.current === 'talking') {
        // jaw follows the loudness of the voice
        const lv = Math.sqrt(levelRef?.current || 0)
        target = { ...target, open: 0.05 + lv * 1.1, w: 100 - lv * 12, arch: 0.2 + lv * 0.6, tongue: 0.5 + lv * 0.5 }
      }
      const k = 1 - Math.exp(-dt / (moodRef.current === 'talking' ? 40 : 110))
      for (const key in cur) cur[key] += (target[key] - cur[key]) * k

      // a slow breath keeps the face alive
      const t = REDUCED ? 0 : now / 1000
      const breath = Math.sin(t * 1.6) * 0.04
      const p = { ...cur, open: Math.max(0, cur.open + breath * (cur.open > 0.05 ? 1 : 0.4)) }

      const d = mouthPath(p)
      const e = el.current
      const lift = p.smile * 13
      const D = p.open * 74
      const ym = -lift
      const open = p.open > 0.04

      // upper teeth hang from the top lip, following its curve
      const yl = -lift + p.skew * 8
      const yr = -lift - p.skew * 8
      const up = (yl + yr) / 2 + p.smile * 9 - p.arch * p.open * 30
      const th = Math.min(30, D * 0.5)
      const w = p.w
      e.teeth.setAttribute(
        'd',
        `M${f(-w)} ${f(yl)}C${f(-w * 0.5)} ${f(up)} ${f(w * 0.5)} ${f(up)} ${f(w)} ${f(yr)}` +
          `L${f(w)} ${f(yr + th)}C${f(w * 0.5)} ${f(up + th * 1.1)} ${f(-w * 0.5)} ${f(up + th * 1.1)} ${f(-w)} ${f(yl + th)}Z`
      )
      e.teeth.style.opacity = open ? Math.min(1, p.open * 6) * (1 - p.arch * 0.1) : 0
      e.gap.setAttribute('d', `M0 ${f(up * 0.75 + (yl + yr) * 0.125)}L0 ${f(up * 0.75 + (yl + yr) * 0.125 + th * 0.95)}`)
      e.gap.style.opacity = e.teeth.style.opacity

      e.fill.setAttribute('d', d)
      e.clip.setAttribute('d', d)
      e.line.setAttribute('d', d)
      e.fill.style.opacity = open ? Math.min(1, p.open * 8) : 0
      e.tongueG.style.opacity = open ? Math.min(1, p.tongue * 3) : 0

      // tongue rises out of the bottom of the mouth, with a gentle wiggle
      const wig = Math.sin(t * 2.4) * 2.5 * p.tongue
      const ry = Math.max(0.1, D * 0.95 * Math.min(1, p.tongue + 0.15))
      const cy = ym + D * 0.98 + p.smile * 4 - ry * 0.2
      e.tongueG.setAttribute('transform', `translate(${f(wig + p.skew * 4)} ${f(cy)})`)
      e.tongue.setAttribute('rx', f(p.w * 0.6))
      e.tongue.setAttribute('ry', f(ry))
      e.groove.setAttribute('d', `M0 ${f(-ry * 0.75)}Q${f(wig * 0.3)} ${f(-ry * 0.1)} 0 ${f(ry * 0.32)}`)
      e.shine.setAttribute('cx', f(-p.w * 0.16))
      e.shine.setAttribute('cy', f(-ry * 0.3))
      e.shine.setAttribute('rx', f(p.w * 0.14))
      e.shine.setAttribute('ry', f(Math.max(0.1, ry * 0.16)))

      // the whole mouth drifts a little toward where the eyes look
      const l = lookRef.current
      const gx = l ? (l.x / window.innerWidth - 0.5) * 30 : 0
      const gy = l ? (l.y / window.innerHeight - 0.5) * 10 : 0
      e.face.setAttribute('transform', `translate(${f(gx)} ${f(gy)})`)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [levelRef])

  const ref = (name) => (node) => {
    el.current[name] = node
  }

  return (
    <svg className="mouth" viewBox="-260 -40 520 150" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-clip`}>
          <path ref={ref('clip')} />
        </clipPath>
        <radialGradient id={`${id}-tongue`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ff93a6" />
          <stop offset="0.55" stopColor="#ee5473" />
          <stop offset="1" stopColor="#c7304f" />
        </radialGradient>
        <linearGradient id={`${id}-teeth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ecdcd8" />
        </linearGradient>
      </defs>

      <g ref={ref('face')}>
        <path ref={ref('fill')} fill={INSIDE} />
        <g clipPath={`url(#${id}-clip)`}>
          <g ref={ref('tongueG')}>
            <ellipse ref={ref('tongue')} cx="0" cy="0" fill={`url(#${id}-tongue)`} />
            <path
              ref={ref('groove')}
              fill="none"
              stroke="#b02847"
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.7"
            />
            <ellipse ref={ref('shine')} fill="#fff" opacity="0.35" />
          </g>
          <path ref={ref('teeth')} fill={`url(#${id}-teeth)`} />
          <path ref={ref('gap')} fill="none" stroke="#d9c9c6" strokeWidth="2" strokeLinecap="round" />
        </g>
        <path
          ref={ref('line')}
          fill="none"
          stroke={LIP}
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

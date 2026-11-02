import { useEffect } from 'react'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Drives the 3D character's head turn. Eases toward wherever the eyes look and
// writes --yaw / --pitch (-1..1) and a slow --breath (-1..1) onto the element,
// which the CSS turns into a perspective rotation, parallax and breathing.
export function useHeadTurn(appRef, lookRef, enabled) {
  useEffect(() => {
    const el = appRef.current
    if (!enabled || !el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let yaw = 0
    let pitch = 0
    let last = performance.now()
    let raf

    const frame = (now) => {
      const dt = Math.min(now - last, 100)
      last = now
      const look = lookRef.current
      const ty = look ? clamp((look.x / window.innerWidth - 0.5) * 2, -1, 1) : 0
      const tp = look ? clamp((look.y / window.innerHeight - 0.5) * 1.6, -1, 1) : 0
      const k = 1 - Math.exp(-dt / 380)
      yaw += (ty - yaw) * k
      pitch += (tp - pitch) * k
      el.style.setProperty('--yaw', yaw.toFixed(4))
      el.style.setProperty('--pitch', pitch.toFixed(4))
      el.style.setProperty('--breath', reduced ? '0' : Math.sin(now / 1000 * 1.4).toFixed(4))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      for (const v of ['--yaw', '--pitch', '--breath']) el.style.removeProperty(v)
    }
  }, [appRef, lookRef, enabled])
}

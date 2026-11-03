import { useCallback, useEffect, useRef } from 'react'

// minutes + seconds (either may be missing) -> whole seconds, or 0 if not a valid length
export function toSeconds({ minutes, seconds } = {}) {
  const m = Number.isFinite(Number(minutes)) ? Number(minutes) : 0
  const s = Number.isFinite(Number(seconds)) ? Number(seconds) : 0
  const total = Math.round(m * 60 + s)
  return total > 0 && total <= 24 * 3600 ? total : 0
}

// Timers the avatar can set ("remind me in 10 minutes"). They live in memory,
// so they end if the page is reloaded. `onFire({ id, label })` runs when one finishes.
export function useTimers({ onFire }) {
  const timers = useRef(new Map()) // id -> { label, at, handle }
  const fireRef = useRef(onFire)
  fireRef.current = onFire

  const add = useCallback(({ seconds, label }) => {
    const id = Math.random().toString(36).slice(2, 8)
    const name = (label || '').trim() || 'timer'
    const handle = setTimeout(() => {
      timers.current.delete(id)
      fireRef.current?.({ id, label: name })
    }, seconds * 1000)
    timers.current.set(id, { label: name, at: Date.now() + seconds * 1000, handle })
    return { id, label: name }
  }, [])

  // cancel by label (case-insensitive), or every timer when no label is given
  const cancel = useCallback((label) => {
    let n = 0
    for (const [id, t] of timers.current) {
      if (!label || t.label.toLowerCase() === String(label).trim().toLowerCase()) {
        clearTimeout(t.handle)
        timers.current.delete(id)
        n++
      }
    }
    return n
  }, [])

  const list = useCallback(
    () => [...timers.current.values()].map((t) => ({ label: t.label, seconds_left: Math.max(0, Math.round((t.at - Date.now()) / 1000)) })),
    []
  )

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t.handle)), [])

  return { add, cancel, list }
}

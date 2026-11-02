import { useEffect, useState } from 'react'

export const DEFAULTS = {
  // models
  yolo: true,
  yunet: true,
  blink: true,
  hands: true,
  recognize: true,
  voice: '', // '' = the server's GEMINI_LIVE_VOICE
  // look
  eyeColor: '#307d76',
  faceColor: '#93c572',
  expression: 1,
  // detection
  objectConf: 0.4,
  faceConf: 0.6,
  onlyPeople: false,
  blinkSens: 0.6,
  // display
  showPreview: true,
  showBoxes: true,
  showLandmarks: false,
  charHands: false,
}

const KEY = 'greeny-settings'

// Settings live in localStorage so they survive reloads; storage can throw
// (private windows, blocked site data), so every access is guarded.
export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    } catch {
      return DEFAULTS
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* ignore */
    }
  }, [settings])

  const set = (key, value) => setSettings((s) => ({ ...s, [key]: value }))
  const reset = () => setSettings(DEFAULTS)
  return [settings, set, reset]
}

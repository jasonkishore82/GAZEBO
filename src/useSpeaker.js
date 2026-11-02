import { useCallback, useRef, useState } from 'react'
import { SpeechSegmenter, pcmToBase64 } from './lib/speaker.js'

// Works out who is talking from their voice. Feed it the mic's PCM chunks; when
// a stretch of speech ends it is sent to /api/voice/identify (SpeechBrain on the
// server) and `speaker` becomes { name, score }, name being null for a voice
// that isn't saved. It stays null until at least one voice has been recorded.
export function useSpeaker() {
  const [speaker, setSpeaker] = useState(null)
  const segmenter = useRef(new SpeechSegmenter())
  const busy = useRef(false)

  const feed = useCallback((pcm) => {
    const segment = segmenter.current.feed(pcm)
    if (!segment || busy.current) return
    busy.current = true
    fetch('/api/voice/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: pcmToBase64(segment) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (!r || r.enrolled === false) return
        setSpeaker((prev) => (prev && prev.name === (r.name ?? null) ? { ...prev, score: r.score } : { name: r.name ?? null, score: r.score }))
      })
      .catch(() => {})
      .finally(() => {
        busy.current = false
      })
  }, [])

  const reset = useCallback(() => {
    segmenter.current.reset()
    setSpeaker(null)
  }, [])

  return { speaker, feed, reset }
}

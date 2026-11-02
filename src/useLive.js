import { useCallback, useEffect, useRef, useState } from 'react'
import { openMic } from './lib/mic.js'
import { contextNote, pcmToBase64 } from './lib/speaker.js'

// Voice chat with Gemini Live through the dev server's /api/live relay.
// Mic audio goes up as 16 kHz PCM; the reply comes back as 24 kHz PCM, is
// played gaplessly, and its loudness is exposed (levelRef) to drive the mouth.
//
// `face` is the name of the person the camera recognises and `speaker` is who
// the voice matcher thinks is talking ({ name } or null); changes in either are
// passed to the model as short notes. `onPcm` receives the mic chunks (while
// the avatar itself isn't speaking) so a speaker matcher can listen too.

const OUT_RATE = 24000

function fromBase64(b64) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function useLive({ face = '', speaker = null, onPcm, voice = '' } = {}) {
  const [state, setState] = useState('off') // off | connecting | live | error
  const [message, setMessage] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [caption, setCaption] = useState('')
  const levelRef = useRef(0)
  const rt = useRef(null)
  const faceRef = useRef(face)
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const onPcmRef = useRef(onPcm)
  const sentKey = useRef('')
  faceRef.current = face
  onPcmRef.current = onPcm

  const stop = useCallback(() => {
    const r = rt.current
    rt.current = null
    if (!r) return
    cancelAnimationFrame(r.raf)
    clearTimeout(r.capTimer)
    try { r.ws.close() } catch { /* already closed */ }
    r.mic?.stop()
    r.outCtx.close().catch(() => {})
    levelRef.current = 0
    setSpeaking(false)
    setCaption('')
  }, [])

  const fail = useCallback((msg) => {
    stop()
    setState('error')
    setMessage(msg)
  }, [stop])

  const start = useCallback(async () => {
    if (rt.current) return
    setState('connecting')
    setMessage('Connecting…')

    const outCtx = new AudioContext({ sampleRate: OUT_RATE })
    const analyser = outCtx.createAnalyser()
    analyser.fftSize = 512
    analyser.connect(outCtx.destination)

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/live?who=${encodeURIComponent(faceRef.current)}&voice=${encodeURIComponent(voiceRef.current)}`)
    const r = { ws, mic: null, outCtx, raf: 0, capTimer: 0, playAt: 0, sources: new Set(), ready: false }
    rt.current = r

    try {
      r.mic = await openMic((pcm) => {
        if (!r.ready || ws.readyState !== 1) return
        ws.send(
          JSON.stringify({
            realtimeInput: { audio: { data: pcmToBase64(pcm), mimeType: 'audio/pcm;rate=16000' } },
          })
        )
        if (!r.sources.size) onPcmRef.current?.(pcm)
      })
    } catch (e) {
      if (rt.current !== r) return
      stop()
      setState('error')
      setMessage(
        e.name === 'NotAllowedError' ? 'Microphone access was blocked.' : e.name === 'NotFoundError' ? 'No microphone found.' : `Audio setup failed: ${e.message}`
      )
      return
    }
    if (rt.current !== r) {
      r.mic.stop() // stopped while the permission prompt was open
      return
    }

    const buf = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += ((v - 128) / 128) ** 2
      const rms = Math.sqrt(sum / buf.length)
      levelRef.current += (Math.min(1, rms * 7) - levelRef.current) * 0.7
      r.raf = requestAnimationFrame(tick)
    }
    r.raf = requestAnimationFrame(tick)

    const play = (pcm) => {
      const n = pcm.length >> 1
      const view = new DataView(pcm.buffer, pcm.byteOffset, n * 2)
      const audio = outCtx.createBuffer(1, n, OUT_RATE)
      const data = audio.getChannelData(0)
      for (let i = 0; i < n; i++) data[i] = view.getInt16(i * 2, true) / 32768
      const src = outCtx.createBufferSource()
      src.buffer = audio
      src.connect(analyser)
      const at = Math.max(outCtx.currentTime + 0.03, r.playAt)
      src.start(at)
      r.playAt = at + audio.duration
      r.sources.add(src)
      setSpeaking(true)
      src.onended = () => {
        r.sources.delete(src)
        if (!r.sources.size) setSpeaking(false)
      }
    }

    const interrupt = () => {
      r.sources.forEach((s) => { try { s.stop() } catch { /* ended */ } })
      r.sources.clear()
      r.playAt = 0
      setSpeaking(false)
    }

    ws.onmessage = (ev) => {
      let m
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.error) return fail(m.error)
      if (m.setupComplete) {
        r.ready = true
        sentKey.current = `${faceRef.current}|`
        setState('live')
        setMessage('Listening')
        return
      }
      const c = m.serverContent
      if (!c) return
      if (c.interrupted) interrupt()
      for (const p of c.modelTurn?.parts || []) {
        if (p.inlineData?.data) play(fromBase64(p.inlineData.data))
      }
      if (c.outputTranscription?.text) {
        setCaption((t) => (t + c.outputTranscription.text).slice(-160))
        clearTimeout(r.capTimer)
        r.capTimer = setTimeout(() => setCaption(''), 5000)
      }
      if (c.turnComplete) {
        clearTimeout(r.capTimer)
        r.capTimer = setTimeout(() => setCaption(''), 3500)
      }
    }
    ws.onerror = () => fail('Could not reach the live relay. Is the dev server running?')
    ws.onclose = () => {
      if (rt.current === r) {
        stop()
        setState((s) => (s === 'error' ? s : 'off'))
      }
    }
  }, [fail, stop])

  useEffect(() => stop, [stop])

  // The persona is set when the chat starts. After that, changes in who is on
  // camera or who is speaking go to the model as notes that don't ask for a reply.
  const spk = speaker ? speaker.name || '?' : '' // '?' = a voice that isn't saved
  useEffect(() => {
    const r = rt.current
    if (!r?.ready || r.ws.readyState !== 1) return
    const key = `${face}|${spk}`
    if (key === sentKey.current) return
    sentKey.current = key
    const note = contextNote(face, spk ? { name: spk === '?' ? null : spk } : null)
    r.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: note }] }], turnComplete: false } }))
  }, [face, spk, state])

  // a voice is fixed for the length of a session, so changing it reconnects
  const lastVoice = useRef(voice)
  useEffect(() => {
    if (lastVoice.current === voice) return
    lastVoice.current = voice
    if (!rt.current) return
    stop()
    setState('off')
    const t = setTimeout(start, 250)
    return () => clearTimeout(t)
  }, [voice, start, stop])

  const toggle = useCallback(() => (rt.current ? (stop(), setState('off'), setMessage('')) : start()), [start, stop])

  return { state, message, speaking, caption, levelRef, toggle }
}

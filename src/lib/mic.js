// Opens the microphone and delivers 16 kHz mono int16 PCM in ~100 ms chunks.

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0][0]
    if (ch) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('tap', Tap)
`

export const MIC_RATE = 16000
const CHUNK = 1600

// Resolves to { stream, stop }. Rejects with the getUserMedia error (e.name is
// NotAllowedError, NotFoundError...) or an Error if audio setup fails.
export async function openMic(onPcm) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const ctx = new AudioContext()
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const node = new AudioWorkletNode(ctx, 'tap')
    const ratio = ctx.sampleRate / MIC_RATE
    let carry = []
    node.port.onmessage = (e) => {
      const x = e.data
      for (let i = 0; i < x.length; i++) carry.push(x[i])
      while (carry.length / ratio >= CHUNK) {
        const pcm = new Int16Array(CHUNK)
        for (let i = 0; i < CHUNK; i++) {
          const s = Math.max(-1, Math.min(1, carry[Math.floor(i * ratio)]))
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        carry = carry.slice(Math.floor(CHUNK * ratio))
        onPcm(pcm)
      }
    }
    ctx.createMediaStreamSource(stream).connect(node)
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    ctx.close().catch(() => {})
    throw e
  }
  return {
    stream,
    stop() {
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => {})
    },
  }
}

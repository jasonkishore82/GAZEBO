// Pure helpers for "who is speaking": cutting the mic stream into speech
// segments, and wording the note that tells Gemini about it.

const CHUNK_MS = 100

// Collects 16 kHz int16 chunks and returns a segment (Int16Array) once someone
// has spoken for long enough and then paused, or has talked for `maxMs`.
export class SpeechSegmenter {
  constructor({ minMs = 1000, maxMs = 3500, pauseMs = 500, floor = 0.012 } = {}) {
    Object.assign(this, { minMs, maxMs, pauseMs, floor })
    this.noise = 0.004
    this.reset()
  }

  reset() {
    this.chunks = []
    this.speechMs = 0
    this.silenceMs = 0
  }

  feed(pcm) {
    let sum = 0
    for (let i = 0; i < pcm.length; i++) sum += (pcm[i] / 32768) ** 2
    const rms = Math.sqrt(sum / (pcm.length || 1))
    const speech = rms > Math.max(this.floor, this.noise * 3)
    if (!speech) this.noise += (rms - this.noise) * 0.05 // learn the room's background level

    if (speech) {
      this.chunks.push(pcm)
      this.speechMs += CHUNK_MS
      this.silenceMs = 0
    } else if (this.chunks.length) {
      this.chunks.push(pcm)
      this.silenceMs += CHUNK_MS
    }

    const ended = this.silenceMs >= this.pauseMs
    if ((ended && this.speechMs >= this.minMs) || this.speechMs >= this.maxMs) return this.take()
    if (ended) this.reset() // a short blip, not worth identifying
    return null
  }

  take() {
    const total = this.chunks.reduce((n, c) => n + c.length, 0)
    const out = new Int16Array(total)
    let at = 0
    for (const c of this.chunks) {
      out.set(c, at)
      at += c.length
    }
    this.reset()
    return out
  }
}

// What to tell the model when the speaker or the person on camera changes.
// `speaker` is null (not identified yet) or { name } with name null when the
// voice isn't recognised. Returns null if there is nothing to say.
export function contextNote(face, speaker) {
  if (speaker) {
    const name = speaker.name
    if (name && face && name === face) return `[Voice update] ${name}, who is on camera, is speaking.`
    if (name && face) return `[Voice update] The voice now speaking is ${name}, not ${face} who is on camera. Talk to ${name}.`
    if (name) return `[Voice update] The voice now speaking is ${name} (not visible on camera).`
    return `[Voice update] A voice the app does not recognise is speaking${face ? `; ${face} is on camera` : ''}.`
  }
  return face
    ? `[Camera update] The person on camera is now recognised as ${face}.`
    : '[Camera update] The camera no longer recognises the person on camera.'
}

// base64 of int16 PCM, in slices so large buffers don't overflow the stack
export function pcmToBase64(pcm) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

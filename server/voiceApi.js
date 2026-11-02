import { voicesRepo } from './db/voices.js'

const MAX_BODY = 3_000_000 // ~30 s of 16 kHz int16 PCM as base64 is ~1.3 MB
// ECAPA cosine scores: same speaker is typically above ~0.3
export const VOICE_MATCH = 0.3

const cleanName = (n) => (typeof n === 'string' ? n.trim().replace(/\s+/g, ' ').slice(0, 120) : '')

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Recording too long'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na * nb) || 1)
}

// Best saved voice for an embedding. A person with several recordings is
// judged on their best-scoring one.
export function matchVoice(embedding, voices, threshold = VOICE_MATCH) {
  let best = null
  for (const v of voices) {
    const score = cosine(embedding, v.embedding)
    if (!best || score > best.score) best = { id: v.id, name: v.name, score }
  }
  return best && best.score >= threshold ? best : null
}

// Sends base64 int16 PCM to the SpeechBrain sidecar and returns its embedding.
async function embed(serviceUrl, audio) {
  if (typeof audio !== 'string' || !audio) throw Object.assign(new Error('No audio received'), { status: 400 })
  let res
  try {
    res = await fetch(`${serviceUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(audio, 'base64'),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw Object.assign(new Error('The voice service is not running yet. Give it a moment and try again.'), { status: 503 })
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error || 'Voice service error'), { status: res.status === 400 ? 400 : 502 })
  return body
}

// /api/voices (GET, POST), /api/voices/:id (PATCH, DELETE), /api/voice/identify (POST)
export function voiceRoutes(db, serviceUrl) {
  const repo = voicesRepo(db)
  const send = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  return async (req, res, next) => {
    const url = req.url || ''
    try {
      if (url.startsWith('/api/voice/identify') && req.method === 'POST') {
        const { audio } = await readJson(req)
        const voices = await repo.withEmbeddings()
        if (!voices.length) return send(res, 200, { name: null, score: 0, enrolled: false })
        const { embedding } = await embed(serviceUrl, audio)
        const m = matchVoice(embedding, voices)
        return send(res, 200, m ? { id: m.id, name: m.name, score: m.score, enrolled: true } : { name: null, score: 0, enrolled: true })
      }

      const m = url.match(/^\/api\/voices(?:\/([\w-]+))?(?:\?.*)?$/)
      if (!m) return next()
      const id = m[1]
      if (req.method === 'GET' && !id) return send(res, 200, await repo.list())
      if (req.method === 'POST' && !id) {
        const b = await readJson(req)
        const name = cleanName(b.name)
        if (!name) return send(res, 400, { error: 'A name is required' })
        const { embedding, seconds } = await embed(serviceUrl, b.audio)
        return send(res, 201, await repo.create({ name, embedding, seconds }))
      }
      if (req.method === 'PATCH' && id) {
        const name = cleanName((await readJson(req)).name)
        if (!name) return send(res, 400, { error: 'A name is required' })
        const v = await repo.rename(id, name)
        return v ? send(res, 200, v) : send(res, 404, { error: 'Voice not found' })
      }
      if (req.method === 'DELETE' && id) {
        return (await repo.remove(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Voice not found' })
      }
      return send(res, 405, { error: 'Method not allowed' })
    } catch (e) {
      if (!e.status) console.error('[voice api]', e)
      return send(res, e.status || 500, { error: e.status ? e.message : 'Server error' })
    }
  }
}

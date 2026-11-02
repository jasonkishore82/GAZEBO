import { facesRepo } from './db/faces.js'

const MAX_BODY = 2_000_000

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }))
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

const cleanName = (n) => (typeof n === 'string' ? n.trim().replace(/\s+/g, ' ').slice(0, 120) : '')
const validEmbedding = (e) => Array.isArray(e) && e.length === 128 && e.every((v) => Number.isFinite(v))
const validThumb = (t) => t == null || (typeof t === 'string' && t.startsWith('data:image/') && t.length < 400_000)

// REST routes for saved faces: GET/POST /api/faces, PATCH/DELETE /api/faces/:id
export function faceRoutes(db) {
  const repo = facesRepo(db)
  const send = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  return async (req, res, next) => {
    const m = req.url?.match(/^\/api\/faces(?:\/([\w-]+))?(?:\?.*)?$/)
    if (!m) return next()
    const id = m[1]
    try {
      if (req.method === 'GET' && !id) return send(res, 200, await repo.list())
      if (req.method === 'POST' && !id) {
        const b = await readJson(req)
        const name = cleanName(b.name)
        if (!name) return send(res, 400, { error: 'A name is required' })
        if (!validEmbedding(b.embedding)) return send(res, 400, { error: 'Invalid face data' })
        if (!validThumb(b.thumbnail)) return send(res, 400, { error: 'Invalid thumbnail' })
        return send(res, 201, await repo.create({ name, embedding: b.embedding, thumbnail: b.thumbnail }))
      }
      if (req.method === 'PATCH' && id) {
        const name = cleanName((await readJson(req)).name)
        if (!name) return send(res, 400, { error: 'A name is required' })
        const face = await repo.rename(id, name)
        return face ? send(res, 200, face) : send(res, 404, { error: 'Face not found' })
      }
      if (req.method === 'DELETE' && id) {
        return (await repo.remove(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Face not found' })
      }
      return send(res, 405, { error: 'Method not allowed' })
    } catch (e) {
      console.error('[api]', e)
      return send(res, e.status || 500, { error: e.status ? e.message : 'Server error' })
    }
  }
}

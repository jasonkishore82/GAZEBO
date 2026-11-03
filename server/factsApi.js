import { factsRepo } from './db/facts.js'

const clean = (s, max) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max) : '')

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 20_000) {
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

// GET /api/facts?person=  POST /api/facts  POST /api/facts/forget  DELETE /api/facts/:id
export function factRoutes(db) {
  const repo = factsRepo(db)
  const send = (res, status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  return async (req, res, next) => {
    const u = new URL(req.url || '', 'http://x')
    const m = u.pathname.match(/^\/api\/facts(?:\/([\w-]+))?$/)
    if (!m) return next()
    const id = m[1]
    try {
      if (req.method === 'GET' && !id) return send(res, 200, await repo.list(clean(u.searchParams.get('person'), 120)))
      if (req.method === 'POST' && id === 'forget') {
        const b = await readJson(req)
        const person = clean(b.person, 120)
        const about = clean(b.about, 200)
        if (!person || !about) return send(res, 400, { error: 'person and about are required' })
        return send(res, 200, { removed: await repo.removeMatching(person, about) })
      }
      if (req.method === 'POST' && !id) {
        const b = await readJson(req)
        const person = clean(b.person, 120)
        const text = clean(b.text, 500)
        if (!person || !text) return send(res, 400, { error: 'person and text are required' })
        return send(res, 201, await repo.create({ person, text }))
      }
      if (req.method === 'DELETE' && id) {
        return (await repo.remove(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Not found' })
      }
      return send(res, 405, { error: 'Method not allowed' })
    } catch (e) {
      if (!e.status) console.error('[facts api]', e)
      return send(res, e.status || 500, { error: e.status ? e.message : 'Server error' })
    }
  }
}

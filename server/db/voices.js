import { randomUUID } from 'node:crypto'

// Voiceprints. Matching runs on the server (the browser never needs them),
// so `list` returns only what the manage window shows.
const toVoice = (r) => ({ id: r.id, name: r.name, seconds: r.seconds, createdAt: r.created_at })

export function voicesRepo(db) {
  return {
    async list() {
      return (await db.all('SELECT id, name, seconds, created_at FROM voices ORDER BY name, created_at')).map(toVoice)
    },
    async withEmbeddings() {
      return (await db.all('SELECT id, name, embedding FROM voices')).map((r) => ({
        id: r.id,
        name: r.name,
        embedding: JSON.parse(r.embedding),
      }))
    },
    async names() {
      return (await db.all('SELECT DISTINCT name FROM voices ORDER BY name')).map((r) => r.name)
    },
    async create({ name, embedding, seconds }) {
      const id = randomUUID()
      const now = new Date().toISOString()
      await db.run(
        'INSERT INTO voices (id, name, embedding, seconds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, JSON.stringify(embedding), seconds ?? null, now, now]
      )
      return toVoice(await db.get('SELECT id, name, seconds, created_at FROM voices WHERE id = ?', [id]))
    },
    async rename(id, name) {
      const r = await db.run('UPDATE voices SET name = ?, updated_at = ? WHERE id = ?', [name, new Date().toISOString(), id])
      if (!r.changes) return null
      return toVoice(await db.get('SELECT id, name, seconds, created_at FROM voices WHERE id = ?', [id]))
    },
    async remove(id) {
      return (await db.run('DELETE FROM voices WHERE id = ?', [id])).changes > 0
    },
  }
}

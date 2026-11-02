import { randomUUID } from 'node:crypto'

// Face records. Embeddings are 128 numbers stored as a JSON string; matching
// happens in the browser, so the database only has to store and list them.
const toFace = (r) => ({
  id: r.id,
  name: r.name,
  embedding: JSON.parse(r.embedding),
  thumbnail: r.thumbnail,
  createdAt: r.created_at,
})

export function facesRepo(db) {
  return {
    async list() {
      return (await db.all('SELECT * FROM faces ORDER BY name, created_at')).map(toFace)
    },
    async names() {
      return (await db.all('SELECT DISTINCT name FROM faces ORDER BY name')).map((r) => r.name)
    },
    async create({ name, embedding, thumbnail }) {
      const id = randomUUID()
      const now = new Date().toISOString()
      await db.run(
        'INSERT INTO faces (id, name, embedding, thumbnail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, JSON.stringify(embedding), thumbnail ?? null, now, now]
      )
      return toFace(await db.get('SELECT * FROM faces WHERE id = ?', [id]))
    },
    async rename(id, name) {
      const r = await db.run('UPDATE faces SET name = ?, updated_at = ? WHERE id = ?', [name, new Date().toISOString(), id])
      if (!r.changes) return null
      return toFace(await db.get('SELECT * FROM faces WHERE id = ?', [id]))
    },
    async remove(id) {
      return (await db.run('DELETE FROM faces WHERE id = ?', [id])).changes > 0
    },
  }
}

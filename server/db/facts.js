import { randomUUID } from 'node:crypto'

const norm = (s) => String(s ?? '').trim().toLowerCase()
const toFact = (r) => ({ id: r.id, person: r.person, text: r.text, createdAt: r.created_at })

export function factsRepo(db) {
  return {
    // all notes, or one person's (case-insensitive), oldest first
    async list(person) {
      const rows = await db.all('SELECT * FROM facts ORDER BY created_at')
      const all = rows.map(toFact)
      return person ? all.filter((f) => norm(f.person) === norm(person)) : all
    },
    async create({ person, text }) {
      const id = randomUUID()
      await db.run('INSERT INTO facts (id, person, text, created_at) VALUES (?, ?, ?, ?)', [
        id,
        person,
        text,
        new Date().toISOString(),
      ])
      return toFact(await db.get('SELECT * FROM facts WHERE id = ?', [id]))
    },
    async remove(id) {
      return (await db.run('DELETE FROM facts WHERE id = ?', [id])).changes > 0
    },
    // delete a person's notes that mention `about`; returns the texts removed
    async removeMatching(person, about) {
      const needle = norm(about)
      if (!needle) return []
      const hits = (await this.list(person)).filter((f) => norm(f.text).includes(needle))
      for (const f of hits) await this.remove(f.id)
      return hits.map((f) => f.text)
    },
  }
}

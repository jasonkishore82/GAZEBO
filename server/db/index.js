import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// The only file that knows which database is underneath. Everything else talks
// to this small async interface (all / get / run / exec), written with plain
// `?` placeholders. To move to MySQL or Supabase, write another adapter with
// the same four methods (see README.md) - repositories and routes don't change.
function sqliteAdapter(file) {
  mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  return {
    dialect: 'sqlite',
    async all(sql, params = []) {
      return db.prepare(sql).all(...params)
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params)
      return { changes: Number(r.changes) }
    },
    async exec(sql) {
      db.exec(sql)
    },
  }
}

// Applies any migrations/NNN_name.sql not yet recorded, in order.
async function migrate(db) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) NOT NULL PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)'
  )
  const done = new Set((await db.all('SELECT name FROM schema_migrations')).map((r) => r.name))
  const dir = join(HERE, 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    await db.exec(readFileSync(join(dir, file), 'utf8'))
    await db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [file, new Date().toISOString()])
    console.log(`[db] applied ${file}`)
  }
}

export async function openDatabase(env = {}) {
  const file = env.DATABASE_FILE || join(HERE, '..', '..', 'data', 'greeny.db')
  const db = sqliteAdapter(file)
  await migrate(db)
  return db
}

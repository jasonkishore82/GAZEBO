# Database

SQLite (`data/greeny.db`, via Node's built-in `node:sqlite`) holds saved faces.

## Layout

- `migrations/NNN_name.sql` - schema changes, applied once each, in filename order
  (tracked in the `schema_migrations` table). Add a new numbered file; never edit an applied one.
- `index.js` - the **adapter**: `all(sql, params)`, `get`, `run` (returns `{ changes }`), `exec`.
  SQL uses `?` placeholders.
- `faces.js` - the repository; it only uses the adapter, never SQLite directly.

## Moving to MySQL or Supabase (Postgres)

1. Write a second adapter in `index.js` with the same four methods
   (`mysql2/promise` for MySQL; `pg` for Supabase's Postgres connection string).
   Postgres wants `$1, $2` instead of `?` - convert inside the adapter.
2. Run the same `migrations/*.sql` against the new database. They use only portable
   types: `VARCHAR`, `TEXT`, app-generated UUID ids and ISO-string timestamps.
   Optional tweaks: `TEXT` -> `LONGTEXT` (MySQL) or `JSONB` (embedding on Postgres),
   and `VARCHAR` timestamps -> `TIMESTAMP`/`timestamptz`.
3. Copy rows over (`SELECT * FROM faces` from SQLite, insert into the new one).
4. Choose the adapter with an env var (e.g. `DATABASE_URL`) and keep `openDatabase()` as the only entry point.

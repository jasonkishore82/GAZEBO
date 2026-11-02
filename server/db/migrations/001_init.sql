-- Portable SQL: stays inside the subset SQLite, MySQL and Postgres/Supabase share.
-- Ids are app-generated UUID strings and timestamps are ISO-8601 strings, so no
-- AUTOINCREMENT / datetime() / UUID defaults are needed. Large JSON/base64
-- payloads are plain TEXT (use LONGTEXT on MySQL, TEXT or JSONB on Postgres).
CREATE TABLE faces (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  embedding TEXT NOT NULL,
  thumbnail TEXT,
  created_at VARCHAR(32) NOT NULL,
  updated_at VARCHAR(32) NOT NULL
);

CREATE INDEX idx_faces_name ON faces (name);

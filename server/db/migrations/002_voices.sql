-- Voiceprints (192-number speaker embeddings from SpeechBrain ECAPA-TDNN).
-- `name` is the same free-text name used in `faces`, so a person's face and
-- voice line up without a foreign key; add one later if you want stricter links.
CREATE TABLE voices (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  embedding TEXT NOT NULL,
  seconds REAL,
  created_at VARCHAR(32) NOT NULL,
  updated_at VARCHAR(32) NOT NULL
);

CREATE INDEX idx_voices_name ON voices (name);

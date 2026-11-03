-- Short notes the avatar remembers about people ("likes green tea").
-- `person` is the same free-text name used in `faces` and `voices`.
CREATE TABLE facts (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  person VARCHAR(120) NOT NULL,
  text VARCHAR(500) NOT NULL,
  created_at VARCHAR(32) NOT NULL
);

CREATE INDEX idx_facts_person ON facts (person);

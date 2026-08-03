CREATE TABLE IF NOT EXISTS installations (
  installation_hash TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  first_version TEXT NOT NULL,
  current_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installations_first_seen ON installations(first_seen);
CREATE INDEX IF NOT EXISTS idx_installations_last_seen ON installations(last_seen);
CREATE INDEX IF NOT EXISTS idx_installations_current_version ON installations(current_version);

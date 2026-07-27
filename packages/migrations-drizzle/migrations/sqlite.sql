CREATE TABLE IF NOT EXISTS laravelize_migrations (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  batch INTEGER NOT NULL CHECK (batch > 0),
  applied_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS laravelize_migrations_batch_idx ON laravelize_migrations (batch, applied_at);
CREATE TABLE IF NOT EXISTS laravelize_migration_locks (name TEXT PRIMARY KEY, acquired_at TEXT NOT NULL);

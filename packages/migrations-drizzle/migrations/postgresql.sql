CREATE TABLE IF NOT EXISTS laravelize_migrations (
  id text PRIMARY KEY,
  namespace text NOT NULL,
  name text NOT NULL,
  checksum text NOT NULL,
  batch integer NOT NULL CHECK (batch > 0),
  applied_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS laravelize_migrations_batch_idx ON laravelize_migrations (batch, applied_at);

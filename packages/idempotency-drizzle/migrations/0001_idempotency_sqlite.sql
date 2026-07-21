CREATE TABLE idempotency_records (
  key text PRIMARY KEY, fingerprint text NOT NULL,
  state text NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
  lease_token text NOT NULL, lease_expires_at integer NOT NULL CHECK (lease_expires_at >= 0),
  expires_at integer NOT NULL CHECK (expires_at >= 0), response text,
  acquisition_marker text NOT NULL,
  CHECK ((state = 'completed' AND response IS NOT NULL AND json_valid(response)) OR (state <> 'completed' AND response IS NULL))
);

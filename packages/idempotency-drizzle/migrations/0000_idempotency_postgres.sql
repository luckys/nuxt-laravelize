CREATE TABLE idempotency_records (
  key text PRIMARY KEY, fingerprint text NOT NULL,
  state text NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
  lease_token text NOT NULL, lease_expires_at bigint NOT NULL CHECK (lease_expires_at >= 0),
  expires_at bigint NOT NULL CHECK (expires_at >= 0), response jsonb,
  acquisition_marker text NOT NULL,
  CHECK ((state = 'completed' AND response IS NOT NULL) OR (state <> 'completed' AND response IS NULL))
);

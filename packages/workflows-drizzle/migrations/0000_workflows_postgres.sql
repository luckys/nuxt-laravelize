CREATE TABLE workflows (
  id text PRIMARY KEY,
  workflow_name text NOT NULL,
  workflow_version text NOT NULL,
  start_key text NOT NULL,
  canonical_input text NOT NULL,
  snapshot jsonb NOT NULL,
  state text NOT NULL,
  revision bigint NOT NULL CONSTRAINT workflows_revision_chk CHECK (revision >= 0 AND revision <= 9007199254740991),
  cancellation_requested boolean NOT NULL,
  lease_token text,
  lease_expires_at bigint CONSTRAINT workflows_lease_expiry_chk CHECK (lease_expires_at IS NULL OR (lease_expires_at >= -9007199254740991 AND lease_expires_at <= 9007199254740991)),
  created_at bigint NOT NULL CONSTRAINT workflows_created_at_chk CHECK (created_at >= -9007199254740991 AND created_at <= 9007199254740991),
  updated_at bigint NOT NULL CONSTRAINT workflows_updated_at_chk CHECK (updated_at >= -9007199254740991 AND updated_at <= 9007199254740991),
  CONSTRAINT workflows_lease_pair_chk CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT workflows_start_key_unique UNIQUE (workflow_name, workflow_version, start_key)
);
CREATE INDEX workflows_lease_expiry_idx ON workflows (lease_expires_at);
CREATE INDEX workflows_state_updated_idx ON workflows (state, updated_at);

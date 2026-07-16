CREATE TABLE audit_entries (id text PRIMARY KEY, schema_version smallint NOT NULL, occurred_at timestamptz NOT NULL, action text NOT NULL, outcome text NOT NULL, subject jsonb, target jsonb, changes jsonb, metadata jsonb, actor_type text, actor_id text, tenant_id text, execution_id text NOT NULL, correlation_id text NOT NULL, causation_id text, source_type text NOT NULL, source_name text, trace_id text, span_id text);
CREATE INDEX audit_entries_tenant_time_idx ON audit_entries (tenant_id, occurred_at);
CREATE INDEX audit_entries_actor_time_idx ON audit_entries (actor_id, occurred_at);
CREATE INDEX audit_entries_target_time_idx ON audit_entries ((target->>'type'), (target->>'id'), occurred_at);
CREATE INDEX audit_entries_correlation_idx ON audit_entries (correlation_id);

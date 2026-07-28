CREATE TABLE database_notifications (
  tenant_scope text NOT NULL,
  id text NOT NULL,
  tenant_id text,
  recipient_type text NOT NULL,
  recipient_id text NOT NULL,
  notification_type text NOT NULL,
  notification_version integer NOT NULL CHECK (notification_version > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  fingerprint text NOT NULL,
  locale text,
  created_at timestamptz NOT NULL,
  read_at timestamptz,
  PRIMARY KEY (tenant_scope, id),
  CONSTRAINT database_notifications_tenant_scope_check CHECK ((tenant_id IS NULL AND tenant_scope = '') OR (tenant_id IS NOT NULL AND tenant_scope = tenant_id)),
  CONSTRAINT database_notifications_read_time_check CHECK (read_at IS NULL OR read_at >= created_at)
);
CREATE INDEX database_notifications_recipient_time_idx ON database_notifications (tenant_scope, recipient_type, recipient_id, created_at DESC, id DESC);
CREATE INDEX database_notifications_unread_idx ON database_notifications (tenant_scope, recipient_type, recipient_id, read_at, created_at DESC);

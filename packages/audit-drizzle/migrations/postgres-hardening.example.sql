-- EXAMPLE ONLY. Replace audit_writer and audit_reader with deployment-owned roles.
-- Run as the table owner after the base migration; do not grant ownership to the app.
REVOKE ALL ON TABLE audit_entries FROM PUBLIC;
GRANT INSERT ON TABLE audit_entries TO audit_writer;
GRANT SELECT ON TABLE audit_entries TO audit_reader;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_entries FROM audit_writer;

-- Optional tenant isolation. Enable only when each transaction executes:
--   SET LOCAL app.tenant_id = '<trusted tenant id>';
-- and the application cannot choose another tenant. Design separate handling for
-- tenant-less/system records. RLS affects reads and writes, not table owners.
-- ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_entries FORCE ROW LEVEL SECURITY;
-- CREATE POLICY audit_writer_insert_tenant ON audit_entries
--   FOR INSERT TO audit_writer
--   WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
-- CREATE POLICY audit_reader_select_tenant ON audit_entries
--   FOR SELECT TO audit_reader
--   USING (tenant_id = current_setting('app.tenant_id', true));

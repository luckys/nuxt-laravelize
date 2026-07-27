import { sql, type SQL } from 'drizzle-orm'
import type { AuditEntry, AuditStore } from '@nuxt-laravelize/audit/runtime'
import { auditEntries } from './schema'

export { auditEntries } from './schema'
export interface DrizzleAuditDatabase { execute(query: SQL): Promise<unknown> }
const json = (value: unknown): string | null => value === undefined ? null : JSON.stringify(value)
export class DrizzlePostgresAuditStore implements AuditStore {
  constructor(private readonly database: DrizzleAuditDatabase) {}

  async append(e: AuditEntry): Promise<void> { await this.database.execute(sql`insert into ${auditEntries} (id, schema_version, occurred_at, action, outcome, subject, target, changes, metadata, actor_type, actor_id, tenant_id, locale, execution_id, correlation_id, causation_id, source_type, source_name, trace_id, span_id) values (${e.id}, ${e.schemaVersion}, ${e.occurredAt}::timestamptz, ${e.action}, ${e.outcome}, ${json(e.subject)}::jsonb, ${json(e.target)}::jsonb, ${json(e.changes)}::jsonb, ${json(e.metadata)}::jsonb, ${e.actor?.type ?? null}, ${e.actor?.id ?? null}, ${e.tenantId ?? null}, ${e.locale ?? null}, ${e.executionId}, ${e.correlationId}, ${e.causationId ?? null}, ${e.source.type}, ${e.source.name ?? null}, ${e.traceId ?? null}, ${e.spanId ?? null})`) }
}

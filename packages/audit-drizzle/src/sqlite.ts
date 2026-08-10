import { sql } from 'drizzle-orm'
import type { AuditEntry, AuditStore } from '@luckys_luis/nuxt-laravelize-audit/runtime'
import type { DrizzleAuditDatabase } from './postgres'
import { sqliteAuditEntries } from './sqlite-schema'

export { sqliteAuditEntries } from './sqlite-schema'
const json = (value: unknown): string | null => value === undefined ? null : JSON.stringify(value)
export class DrizzleSQLiteAuditStore implements AuditStore {
  constructor(private readonly database: DrizzleAuditDatabase) {}

  async append(e: AuditEntry): Promise<void> { await this.database.execute(sql`insert into ${sqliteAuditEntries} (id, schema_version, occurred_at, action, outcome, subject, target, changes, metadata, actor_type, actor_id, tenant_id, locale, execution_id, correlation_id, causation_id, source_type, source_name, trace_id, span_id) values (${e.id}, ${e.schemaVersion}, ${new Date(e.occurredAt).getTime()}, ${e.action}, ${e.outcome}, ${json(e.subject)}, ${json(e.target)}, ${json(e.changes)}, ${json(e.metadata)}, ${e.actor?.type ?? null}, ${e.actor?.id ?? null}, ${e.tenantId ?? null}, ${e.locale ?? null}, ${e.executionId}, ${e.correlationId}, ${e.causationId ?? null}, ${e.source.type}, ${e.source.name ?? null}, ${e.traceId ?? null}, ${e.spanId ?? null})`) }
}

import type { AuditEntry, AuditStore } from '@nuxt-laravelize/audit/runtime'

export interface TursoAuditClient { execute(statement: { sql: string, args: readonly unknown[] }): Promise<unknown> }
const json = (value: unknown): string | null => value === undefined ? null : JSON.stringify(value)
export class TursoAuditStore implements AuditStore {
  constructor(private readonly client: TursoAuditClient) {}

  async append(e: AuditEntry): Promise<void> { await this.client.execute({ sql: 'insert into audit_entries (id,schema_version,occurred_at,action,outcome,subject,target,changes,metadata,actor_type,actor_id,tenant_id,execution_id,correlation_id,causation_id,source_type,source_name,trace_id,span_id) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', args: [e.id, e.schemaVersion, new Date(e.occurredAt).getTime(), e.action, e.outcome, json(e.subject), json(e.target), json(e.changes), json(e.metadata), e.actor?.type ?? null, e.actor?.id ?? null, e.tenantId ?? null, e.executionId, e.correlationId, e.causationId ?? null, e.source.type, e.source.name ?? null, e.traceId ?? null, e.spanId ?? null] }) }
}

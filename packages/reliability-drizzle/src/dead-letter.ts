/* eslint-disable @stylistic/max-statements-per-line, @stylistic/lines-between-class-members, unicorn/error-message */
import { sql } from 'drizzle-orm'
import { DeadLetterAmbiguousError, DeadLetterInvalidStateError, DeadLetterNotFoundError, DeadLetterOperationConflictError, DeadLetterStaleRevisionError, DeadLetterUnmanagedLegacyError, deadLetterOperationFingerprint, sanitizeDeadLetterError, validateMutation, type DeadLetterAdapter, type DeadLetterDetail, type DeadLetterKey, type DeadLetterListRequest, type DeadLetterMutation, type DeadLetterMutationResult, type DeadLetterRetry, type DeadLetterSummary } from '@nuxt-laravelize/dead-letter'
import { createEnvelope, type MessageEnvelope } from '@nuxt-laravelize/reliability'
import type { DrizzleReliabilityDatabase } from './base.js'

type Row = Record<string, unknown>
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: Row[] }).rows : []
const iso = (value: unknown) => new Date(value instanceof Date ? value.getTime() : String(value)).toISOString()
const envelopeOf = (row: Row) => (typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope) as MessageEnvelope
const summary = (row: Row, tenant = false, includeError = false): DeadLetterSummary => {
  const error = includeError ? sanitizeDeadLetterError(row.last_error) : undefined
  const tenantHint = tenant ? envelopeOf(row).context?.tenantId : undefined
  return { key: { source: 'reliability', namespace: String(row.kind), id: String(row.id) }, type: String(row.message_type), disposition: String(row.disposition) as DeadLetterSummary['disposition'], attempts: Number(row.attempts), terminalAt: iso(row.terminal_at), ...(row.available_at ? { availableAt: iso(row.available_at) } : {}), ...(error ? { error } : {}), revision: String(row.management_revision), ...(tenantHint ? { tenantHint } : {}) }
}
const parseCursor = (cursor?: string): { terminalAt: string, namespace: string, id: string } | undefined => {
  if (!cursor) return undefined
  try { const value = JSON.parse(cursor) as Record<string, unknown>; if (Object.keys(value).sort().join(',') !== 'id,namespace,terminalAt' || typeof value.id !== 'string' || value.id.length > 128 || typeof value.namespace !== 'string' || value.namespace.length > 64 || typeof value.terminalAt !== 'string' || new Date(value.terminalAt).toISOString() !== value.terminalAt) throw new Error(); return value as { terminalAt: string, namespace: string, id: string } }
  catch { throw new TypeError('Invalid reliability cursor') }
}
const canonicalRevision = (revision: string): string => {
  if (!/^(?:0|[1-9]\d*)$/.test(revision) || BigInt(revision) > BigInt(Number.MAX_SAFE_INTEGER)) throw new DeadLetterStaleRevisionError()
  return revision
}

/** Administrative capability. Use credentials separate from the worker store. */
export class DrizzleReliabilityDeadLetterAdapter implements DeadLetterAdapter {
  readonly source = 'reliability'
  readonly capabilities = Object.freeze({ retry: true, discard: true, scheduleRetry: true })
  constructor(private readonly database: DrizzleReliabilityDatabase, private readonly clock: () => Date = () => new Date()) {}
  async list(request: Omit<DeadLetterListRequest, 'source' | 'cursor'> & { cursor?: string }) {
    const limit = request.limit ?? 25; const cursor = parseCursor(request.cursor)
    const namespace = request.namespace ? sql`and kind = ${request.namespace}` : sql``
    const type = request.type ? sql`and message_type = ${request.type}` : sql``
    const disposition = request.disposition ? sql`and disposition = ${request.disposition}` : sql``
    const after = cursor ? sql`and (terminal_at > ${cursor.terminalAt} or (terminal_at = ${cursor.terminalAt} and kind > ${cursor.namespace}) or (terminal_at = ${cursor.terminalAt} and kind = ${cursor.namespace} and id > ${cursor.id}))` : sql``
    const envelope = request.includeTenantHint ? sql`, envelope` : sql``; const error = request.includeErrorSummary ? sql`, last_error` : sql``
    const selected = rows(await this.database.execute(sql`select kind, id, message_type, attempts, available_at, terminal_at, disposition, management_revision ${envelope} ${error} from reliability_messages where state = 'dead' and terminal_at is not null ${namespace} ${type} ${disposition} ${after} order by terminal_at, kind, id limit ${limit + 1}`))
    const page = selected.slice(0, limit); const last = page.at(-1)
    return { items: page.map(row => summary(row, request.includeTenantHint, request.includeErrorSummary)), ...(selected.length > page.length && last ? { nextCursor: JSON.stringify({ terminalAt: iso(last.terminal_at), namespace: String(last.kind), id: String(last.id) }) } : {}) }
  }
  async get(key: DeadLetterKey, options?: { includePayload?: boolean, includeTenantHint?: boolean, includeErrorSummary?: boolean }): Promise<DeadLetterDetail> {
    const envelopeColumn = options?.includePayload || options?.includeTenantHint ? sql`, envelope` : sql``; const error = options?.includeErrorSummary ? sql`, last_error` : sql``
    const row = rows(await this.database.execute(sql`select kind, id, message_type, attempts, available_at, terminal_at, disposition, management_revision ${envelopeColumn} ${error} from reliability_messages where kind = ${key.namespace} and id = ${key.id} and state = 'dead' limit 1`))[0]
    if (!row) throw new DeadLetterNotFoundError()
    if (row.terminal_at == null) throw new DeadLetterUnmanagedLegacyError()
    const base = summary(row, options?.includeTenantHint, options?.includeErrorSummary)
    if (!options?.includePayload) return base
    const envelope = envelopeOf(row)
    return { ...base, payload: createEnvelope({ id: envelope.id, type: envelope.type, occurredAt: envelope.occurredAt, payload: envelope.payload, context: envelope.context }).payload }
  }
  retry(request: DeadLetterRetry) { return this.mutate('retry', request) }
  discard(request: DeadLetterMutation) { return this.mutate('discard', request) }
  private async mutate(action: 'retry' | 'discard', request: DeadLetterMutation): Promise<DeadLetterMutationResult> {
    validateMutation(request); const hash = await deadLetterOperationFingerprint(action, request); const now = this.clock().toISOString()
    const revision = canonicalRevision(request.revision)
    const prior = await this.operation(request.operationId)
    if (prior) return this.replay(prior, request, hash, action)
    try { await this.database.execute(sql`insert into reliability_dead_letter_operations (operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at) values (${request.operationId}, ${hash}, 'reliability', ${request.key.namespace}, ${request.key.id}, ${action}, 'pending', ${now})`) }
    catch { const raced = await this.operation(request.operationId); if (raced) return this.replay(raced, request, hash, action); throw new DeadLetterAmbiguousError() }
    const values = action === 'retry'
      ? sql`state = 'pending', terminal_at = null, available_at = ${(request as DeadLetterRetry).availableAt}, lease_owner = null, lease_token = null, lease_until = null, management_operation_result_revision = management_revision + 1, management_operation_result_disposition = 'active', management_revision = management_revision + 1, management_operation_id = ${request.operationId}, management_operation_fingerprint = ${hash}, management_operation_action = ${action}, management_operation_at = ${now}`
      : sql`disposition = 'discarded', management_operation_result_revision = management_revision + 1, management_operation_result_disposition = 'discarded', management_revision = management_revision + 1, management_operation_id = ${request.operationId}, management_operation_fingerprint = ${hash}, management_operation_action = ${action}, management_operation_at = ${now}`
    let changed: Row | undefined
    try { changed = rows(await this.database.execute(sql`update reliability_messages set ${values} where kind = ${request.key.namespace} and id = ${request.key.id} and state = 'dead' and disposition = 'active' and management_revision = ${revision} returning management_revision, management_operation_at`))[0] }
    catch { throw new DeadLetterAmbiguousError() }
    if (changed) { const result = { key: request.key, disposition: action === 'discard' ? 'discarded' as const : 'active' as const, revision: String(changed.management_revision), operationId: request.operationId, committedAt: iso(changed.management_operation_at) }; await this.finalizeCommitted(request.operationId, hash, result); return result }
    const marker = rows(await this.database.execute(sql`select kind, id, management_operation_result_disposition, management_operation_result_revision, management_operation_fingerprint, management_operation_action, management_operation_at from reliability_messages where management_operation_id = ${request.operationId} limit 1`))[0]
    if (marker) { const result = this.markerResult(marker, request, hash, action); await this.finalizeCommitted(request.operationId, hash, result); return result }
    const row = rows(await this.database.execute(sql`select state, disposition, management_revision from reliability_messages where kind = ${request.key.namespace} and id = ${request.key.id} limit 1`))[0]
    const failure = !row ? 'not_found' : String(row.management_revision) !== request.revision ? 'stale_revision' : 'invalid_state'
    await this.database.execute(sql`update reliability_dead_letter_operations set status = 'failed', resolved_at = ${now}, failure_code = ${failure} where operation_id = ${request.operationId} and fingerprint = ${hash} and status = 'pending'`)
    if (failure === 'not_found') throw new DeadLetterNotFoundError(); if (failure === 'stale_revision') throw new DeadLetterStaleRevisionError(); throw new DeadLetterInvalidStateError()
  }
  private async replay(row: Row, request: DeadLetterMutation, hash: string, action: 'retry' | 'discard'): Promise<DeadLetterMutationResult> {
    if (row.fingerprint !== hash || row.action !== action || row.message_kind !== request.key.namespace || row.message_id !== request.key.id) throw new DeadLetterOperationConflictError()
    if (row.status === 'pending') return this.reconcilePending(row, request, hash, action)
    if (row.status === 'failed') { if (row.failure_code === 'not_found') throw new DeadLetterNotFoundError(); if (row.failure_code === 'stale_revision') throw new DeadLetterStaleRevisionError(); throw new DeadLetterInvalidStateError() }
    return { key: request.key, disposition: String(row.result_disposition) as DeadLetterMutationResult['disposition'], revision: String(row.result_revision), operationId: request.operationId, committedAt: iso(row.resolved_at) }
  }
  private async reconcilePending(_row: Row, request: DeadLetterMutation, hash: string, action: 'retry' | 'discard'): Promise<DeadLetterMutationResult> { const marker = rows(await this.database.execute(sql`select kind, id, management_operation_result_disposition, management_operation_result_revision, management_operation_fingerprint, management_operation_action, management_operation_at from reliability_messages where management_operation_id = ${request.operationId} limit 1`))[0]; if (!marker) throw new DeadLetterAmbiguousError(); const result = this.markerResult(marker, request, hash, action); await this.finalizeCommitted(request.operationId, hash, result); return result }
  private markerResult(row: Row, request: DeadLetterMutation, hash: string, action: 'retry' | 'discard'): DeadLetterMutationResult { if (row.management_operation_fingerprint !== hash || row.management_operation_action !== action || row.kind !== request.key.namespace || row.id !== request.key.id) throw new DeadLetterOperationConflictError(); return { key: request.key, disposition: String(row.management_operation_result_disposition) as DeadLetterMutationResult['disposition'], revision: String(row.management_operation_result_revision), operationId: request.operationId, committedAt: iso(row.management_operation_at) } }
  private async operation(id: string) { return rows(await this.database.execute(sql`select operation_id, fingerprint, message_kind, message_id, action, status, resolved_at, result_revision, result_disposition, failure_code from reliability_dead_letter_operations where operation_id = ${id} limit 1`))[0] }
  private async finalizeCommitted(id: string, hash: string, result: DeadLetterMutationResult) {
    try { await this.database.execute(sql`update reliability_dead_letter_operations set status = 'committed', resolved_at = ${result.committedAt}, result_revision = ${canonicalRevision(result.revision)}, result_disposition = ${result.disposition} where operation_id = ${id} and fingerprint = ${hash} and status = 'pending'`); const receipt = await this.operation(id); if (receipt?.status !== 'committed' || receipt.fingerprint !== hash) throw new Error() }
    catch { throw new DeadLetterAmbiguousError() }
  }
}

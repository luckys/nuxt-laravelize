import { sql } from 'drizzle-orm'
import { DeadLetterOperationConflictError, validateDeadLetterKey, type DeadLetterMutationResult, type DeadLetterOperationReceipt, type DeadLetterOperationStore } from '@nuxt-laravelize/dead-letter'
import type { DrizzleReliabilityDatabase } from './base.js'

type Row = Record<string, unknown>
type Resolution = Parameters<DeadLetterOperationStore['finalize']>[2]
const OPERATION_ID = /^[\w.:-]{1,128}$/
const FINGERPRINT = /^[0-9a-f]{64}$/
const FAILURE_CODES = new Set(['not_found', 'stale_revision', 'invalid_state'])
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: Row[] }).rows : []
const operationId = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) throw new TypeError('Invalid dead-letter operation ID')
  return value
}
const fingerprint = (value: unknown): string => {
  if (typeof value !== 'string' || !FINGERPRINT.test(value)) throw new TypeError('Invalid dead-letter operation fingerprint')
  return value
}
const revision = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) throw new TypeError('Invalid dead-letter operation revision')
  return value
}
const timestamp = (value: unknown, name: string): string => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value))
  if (!Number.isFinite(parsed)) throw new TypeError(`Invalid persisted dead-letter ${name}`)
  return new Date(parsed).toISOString()
}
const failureCode = (value: unknown): NonNullable<DeadLetterOperationReceipt['failureCode']> => {
  if (typeof value !== 'string' || !FAILURE_CODES.has(value)) throw new TypeError('Invalid dead-letter operation failure code')
  return value as NonNullable<DeadLetterOperationReceipt['failureCode']>
}
const canonicalTimestamp = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError(`${name} must be a canonical ISO timestamp`)
  return value
}
const validateResult = (id: string, result: DeadLetterMutationResult): DeadLetterMutationResult => {
  if (!result || typeof result !== 'object' || result.operationId !== id) throw new TypeError('Dead-letter result operation ID does not match')
  validateDeadLetterKey(result.key)
  revision(result.revision)
  canonicalTimestamp(result.committedAt, 'committedAt')
  if (result.disposition !== 'active' && result.disposition !== 'discarded') throw new TypeError('Invalid dead-letter result disposition')
  return result
}
const receipt = (id: string, row: Row): DeadLetterOperationReceipt => {
  const hash = fingerprint(row.fingerprint)
  if (row.status === 'pending') {
    if (row.resolved_at != null || row.result_revision != null || row.result_disposition != null || row.failure_code != null) throw new TypeError('Invalid persisted pending dead-letter operation')
    return { fingerprint: hash, status: 'pending' }
  }
  if (row.status === 'failed') {
    timestamp(row.resolved_at, 'resolution timestamp')
    if (row.result_revision != null || row.result_disposition != null) throw new TypeError('Invalid persisted failed dead-letter operation')
    return { fingerprint: hash, status: 'failed', failureCode: failureCode(row.failure_code) }
  }
  if (row.status !== 'committed') throw new TypeError('Invalid persisted dead-letter operation status')
  if (row.failure_code != null) throw new TypeError('Invalid persisted committed dead-letter operation')
  const result = validateResult(id, {
    key: { source: String(row.source), namespace: String(row.message_kind), id: String(row.message_id) },
    disposition: row.result_disposition as DeadLetterMutationResult['disposition'],
    revision: revision(row.result_revision),
    operationId: id,
    committedAt: timestamp(row.resolved_at, 'resolution timestamp'),
  })
  return { fingerprint: hash, status: 'committed', result }
}
const sameResult = (left: DeadLetterMutationResult, right: DeadLetterMutationResult): boolean => left.operationId === right.operationId && left.disposition === right.disposition && left.revision === right.revision && left.committedAt === right.committedAt && left.key.source === right.key.source && left.key.namespace === right.key.namespace && left.key.id === right.key.id
const sameResolution = (current: DeadLetterOperationReceipt, resolution: Resolution): boolean => current.status === resolution.status && (resolution.status === 'failed' ? current.failureCode === resolution.failureCode : current.result !== undefined && sameResult(current.result, resolution.result))

/** Durable operation receipts for adapters, such as BullMQ, whose mutation and receipt cannot share a transaction. */
export class DrizzleDeadLetterOperationStore implements DeadLetterOperationStore {
  readonly durability = 'durable' as const
  constructor(private readonly database: DrizzleReliabilityDatabase, private readonly clock: () => Date = () => new Date()) {}

  async get(id: string): Promise<DeadLetterOperationReceipt | undefined> {
    const validId = operationId(id)
    const row = rows(await this.database.execute(sql`select fingerprint, source, message_kind, message_id, status, resolved_at, result_revision, result_disposition, failure_code from reliability_dead_letter_operations where operation_id = ${validId} limit 1`))[0]
    return row ? receipt(validId, row) : undefined
  }

  async reserve(id: string, hash: string): Promise<'reserved' | 'exists'> {
    const validId = operationId(id)
    const validHash = fingerprint(hash)
    const now = this.clock().toISOString()
    const inserted = rows(await this.database.execute(sql`insert into reliability_dead_letter_operations (operation_id, fingerprint, status, reserved_at) values (${validId}, ${validHash}, 'pending', ${now}) on conflict (operation_id) do nothing returning operation_id`))
    if (inserted.length > 1 || (inserted[0] && inserted[0].operation_id !== validId)) throw new TypeError('Invalid dead-letter reservation result')
    return inserted.length === 1 ? 'reserved' : 'exists'
  }

  async finalize(id: string, hash: string, resolution: Resolution): Promise<void> {
    const validId = operationId(id)
    const validHash = fingerprint(hash)
    const changed = resolution.status === 'committed'
      ? await this.commit(validId, validHash, validateResult(validId, resolution.result))
      : await this.fail(validId, validHash, failureCode(resolution.failureCode))
    if (changed) return
    const current = await this.get(validId)
    if (!current || current.fingerprint !== validHash || !sameResolution(current, resolution)) throw new DeadLetterOperationConflictError()
  }

  private async commit(id: string, hash: string, result: DeadLetterMutationResult): Promise<boolean> {
    const changed = rows(await this.database.execute(sql`update reliability_dead_letter_operations set status = 'committed', resolved_at = ${result.committedAt}, source = ${result.key.source}, message_kind = ${result.key.namespace}, message_id = ${result.key.id}, result_revision = ${result.revision}, result_disposition = ${result.disposition}, failure_code = null where operation_id = ${id} and fingerprint = ${hash} and status = 'pending' returning operation_id`))
    return this.changed(id, changed)
  }

  private async fail(id: string, hash: string, code: NonNullable<DeadLetterOperationReceipt['failureCode']>): Promise<boolean> {
    const now = this.clock().toISOString()
    const changed = rows(await this.database.execute(sql`update reliability_dead_letter_operations set status = 'failed', resolved_at = ${now}, result_revision = null, result_disposition = null, failure_code = ${code} where operation_id = ${id} and fingerprint = ${hash} and status = 'pending' returning operation_id`))
    return this.changed(id, changed)
  }

  private changed(id: string, changed: Row[]): boolean {
    if (changed.length > 1 || (changed[0] && changed[0].operation_id !== id)) throw new TypeError('Invalid dead-letter finalization result')
    return changed.length === 1
  }
}

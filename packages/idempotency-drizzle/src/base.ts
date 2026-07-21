import { sql, type SQL } from 'drizzle-orm'
import type { AcquireResult, IdempotencyRecord, IdempotencyState, IdempotencyStore, StoredResponse } from '@nuxt-laravelize/idempotency/runtime'

export type IdempotencyQueryExecutor = (query: SQL) => unknown | PromiseLike<unknown>
type Row = Record<string, unknown>
type ResponseEnvelope = { version: 1, kind: 'json' | 'response', status: number, headers: Record<string, string>, body: unknown }

const resultRows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: Row[] }).rows : []
const nonEmptyString = (value: unknown, name: string) => {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`Invalid persisted ${name}`)
  return value
}
const mutationSucceeded = (value: unknown) => {
  const rows = resultRows(value)
  if (rows.length === 0) return false
  if (rows.length !== 1) throw new Error('Idempotency mutation returned an invalid row count')
  nonEmptyString(rows[0]!.key, 'key')
  return true
}
const integer = (value: unknown, name: string) => {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) throw new TypeError(`Invalid persisted ${name}`)
  return number
}
const durationEnd = (now: number, duration: number) => {
  integer(now, 'now')
  integer(duration, 'duration')
  const end = now + duration
  if (!Number.isSafeInteger(end)) throw new RangeError('Idempotency timestamp exceeds the safe integer range')
  return end
}
const jsonSafe = (value: unknown, seen = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value) ? value.every(item => jsonSafe(item, seen)) : (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) && Object.values(value as Record<string, unknown>).every(item => jsonSafe(item, seen))
  seen.delete(value)
  return valid
}
const envelope = (response: StoredResponse): ResponseEnvelope => {
  if ((response.kind !== 'json' && response.kind !== 'response') || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 || !response.headers || Array.isArray(response.headers) || Object.getPrototypeOf(response.headers) !== Object.prototype || Object.entries(response.headers).some(([key, value]) => !key || typeof value !== 'string')) throw new TypeError('Invalid idempotency response')
  if (response.kind === 'response' && (typeof response.body !== 'string' || !/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/i.test(response.body))) throw new TypeError('Invalid binary response envelope')
  if (response.kind === 'json' && !jsonSafe(response.body)) throw new TypeError('Invalid JSON response envelope')
  return { version: 1, kind: response.kind, status: response.status, headers: { ...response.headers }, body: response.body }
}
const readResponse = (raw: unknown): StoredResponse | undefined => {
  if (raw === null || raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  }
  catch {
    throw new TypeError('Invalid persisted response envelope')
  }
  if (!parsed || typeof parsed !== 'object' || (parsed as { version?: unknown }).version !== 1) throw new TypeError('Invalid persisted response envelope')
  const valid = envelope(parsed as ResponseEnvelope)
  return { kind: valid.kind, status: valid.status, headers: valid.headers, body: valid.body }
}
const record = (row: Row): IdempotencyRecord => {
  const state = nonEmptyString(row.state, 'state')
  if (!['processing', 'completed', 'failed'].includes(state)) throw new TypeError('Invalid persisted idempotency state')
  const response = readResponse(row.response)
  if ((state === 'completed') !== Boolean(response)) throw new TypeError('Invalid persisted idempotency response state')
  return { key: nonEmptyString(row.key, 'key'), fingerprint: nonEmptyString(row.fingerprint, 'fingerprint'), state: state as IdempotencyState, leaseToken: nonEmptyString(row.lease_token, 'lease token'), leaseExpiresAt: integer(row.lease_expires_at, 'lease expiry'), expiresAt: integer(row.expires_at, 'expiry'), ...(response ? { response } : {}) }
}

export abstract class DrizzleIdempotencyStore implements IdempotencyStore {
  readonly durability = 'durable' as const
  constructor(private readonly executeRows: IdempotencyQueryExecutor) {}

  async acquire(input: { key: string, fingerprint: string, leaseToken: string, now: number, leaseMs: number, retentionMs: number, retryFailed?: boolean }): Promise<AcquireResult> {
    const leaseExpiresAt = durationEnd(input.now, input.leaseMs)
    durationEnd(input.now, input.retentionMs)
    const marker = `${input.leaseToken}\u0000${input.now}\u0000${Math.random().toString(36).slice(2)}`
    const eligible = sql`(idempotency_records.expires_at <= ${input.now} or (idempotency_records.fingerprint = excluded.fingerprint and ((idempotency_records.state = 'processing' and idempotency_records.lease_expires_at <= ${input.now}) or (idempotency_records.state = 'failed' and ${input.retryFailed === true}))))`
    const rows = resultRows(await this.executeRows(sql`insert into idempotency_records (key, fingerprint, state, lease_token, lease_expires_at, expires_at, response, acquisition_marker) values (${input.key}, ${input.fingerprint}, 'processing', ${input.leaseToken}, ${leaseExpiresAt}, ${leaseExpiresAt}, null, ${marker}) on conflict (key) do update set fingerprint = case when ${eligible} then excluded.fingerprint else idempotency_records.fingerprint end, state = case when ${eligible} then 'processing' else idempotency_records.state end, lease_token = case when ${eligible} then excluded.lease_token else idempotency_records.lease_token end, lease_expires_at = case when ${eligible} then excluded.lease_expires_at else idempotency_records.lease_expires_at end, expires_at = case when ${eligible} then excluded.expires_at else idempotency_records.expires_at end, response = case when ${eligible} then null else idempotency_records.response end, acquisition_marker = case when ${eligible} then excluded.acquisition_marker else idempotency_records.acquisition_marker end returning key, fingerprint, state, lease_token, lease_expires_at, expires_at, response, acquisition_marker`))
    if (rows.length !== 1) throw new Error('Idempotency acquire did not return exactly one row')
    const returnedMarker = nonEmptyString(rows[0]!.acquisition_marker, 'acquisition marker')
    const stored = record(rows[0]!)
    const acquired = returnedMarker === marker
    if (acquired) return { outcome: 'acquired', record: stored }
    if (stored.fingerprint !== input.fingerprint) return { outcome: 'conflict', record: stored }
    return { outcome: stored.state === 'completed' ? 'replay' : stored.state === 'failed' ? 'failed' : 'processing', record: stored }
  }

  async renew(key: string, token: string, now: number, leaseMs: number): Promise<boolean> {
    const end = durationEnd(now, leaseMs)
    return mutationSucceeded(await this.executeRows(sql`update idempotency_records set lease_expires_at = ${end}, expires_at = ${end} where key = ${key} and state = 'processing' and lease_token = ${token} and lease_expires_at > ${now} returning key`))
  }

  async complete(key: string, token: string, response: StoredResponse, now: number, retentionMs: number): Promise<boolean> { return this.finish(key, token, now, retentionMs, 'completed', envelope(response)) }

  async fail(key: string, token: string, now: number, retentionMs: number): Promise<boolean> { return this.finish(key, token, now, retentionMs, 'failed') }

  private async finish(key: string, token: string, now: number, retentionMs: number, state: 'completed' | 'failed', response?: ResponseEnvelope): Promise<boolean> {
    const expires = durationEnd(now, retentionMs)
    const persisted = response ? JSON.stringify(response) : null
    return mutationSucceeded(await this.executeRows(sql`update idempotency_records set state = ${state}, lease_expires_at = ${now}, expires_at = ${expires}, response = ${persisted} where key = ${key} and state = 'processing' and lease_token = ${token} and lease_expires_at > ${now} returning key`))
  }
}

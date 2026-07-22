import { sql, type SQL } from 'drizzle-orm'
import { canonicalizeEnvelope, createEnvelope, normalizeReliabilityPruneOptions, OutboxMessageConflictError, sanitizeErrorSummary, type ClaimOptions, type InboxClaim, type InboxStore, type MessageEnvelope, type MessageNamespace, type OutboxAppendOptions, type OutboxStore, type PrunableReliabilityStore, type ReliabilityPruneOptions, type ReliabilityPruneResult, type StoredMessage } from '@nuxt-laravelize/reliability'
import type { UnitOfWork } from '@nuxt-laravelize/database/runtime'

export interface DrizzleReliabilityDatabase {
  execute(query: SQL): unknown | PromiseLike<unknown>
}
type Row = Record<string, unknown>
const rows = (result: unknown): Row[] => Array.isArray(result)
  ? result as Row[]
  : result && typeof result === 'object' && Array.isArray((result as {
    rows?: unknown
  }).rows)
    ? (result as {
        rows: Row[]
      }).rows
    : []
const readEnvelope = (value: unknown): MessageEnvelope => {
  const parsed = (typeof value === 'string' ? JSON.parse(value) : value) as MessageEnvelope
  if (!parsed || parsed.version !== 1)
    throw new TypeError('Invalid persisted message envelope')
  return createEnvelope({ id: parsed.id, type: parsed.type, occurredAt: parsed.occurredAt, payload: parsed.payload, context: parsed.context })
}
const canonicalIso = (value: string, name: string): string => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new TypeError(`${name} must be a canonical ISO timestamp`)
  return value
}
const persistedIso = (value: unknown, name: string): string => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value))
  if (!Number.isFinite(parsed)) throw new TypeError(`${name} must be a valid timestamp`)
  return new Date(parsed).toISOString()
}
const stored = (row: Row): StoredMessage => ({ envelope: readEnvelope(row.envelope), state: String(row.state) as StoredMessage['state'], attempts: Number(row.attempts), availableAt: persistedIso(row.available_at, 'availableAt'), ...(row.lease_owner ? { leaseOwner: String(row.lease_owner) } : {}), ...(row.lease_token ? { leaseToken: String(row.lease_token) } : {}), ...(row.lease_until ? { leaseUntil: persistedIso(row.lease_until, 'leaseUntil') } : {}), ...(row.last_error ? { lastError: String(row.last_error) } : {}) })
export abstract class DrizzleReliabilityStore implements OutboxStore, InboxStore, PrunableReliabilityStore {
  readonly durability = 'durable' as const
  constructor(protected readonly database: DrizzleReliabilityDatabase) { }
  async append(envelope: MessageEnvelope, options?: OutboxAppendOptions): Promise<void> {
    await this.appendWith(this.database, envelope, options)
  }

  async appendWith(database: DrizzleReliabilityDatabase, envelope: MessageEnvelope, options: OutboxAppendOptions = {}): Promise<void> {
    const normalized = readEnvelope(envelope)
    const availableAt = canonicalIso(options.availableAt ?? normalized.occurredAt, 'availableAt')
    const persisted = rows(await database.execute(sql`insert into reliability_messages (kind, id, message_type, envelope, state, attempts, available_at, append_available_at) values ('outbox', ${normalized.id}, ${normalized.type}, ${canonicalizeEnvelope(normalized)}, 'pending', 0, ${availableAt}, ${availableAt}) on conflict (kind, id) do update set id = excluded.id where reliability_messages.envelope = excluded.envelope and reliability_messages.append_available_at = excluded.append_available_at returning id`))[0]
    if (!persisted) throw new OutboxMessageConflictError(normalized.id)
  }

  async appendIn(unitOfWork: UnitOfWork<DrizzleReliabilityDatabase>, envelope: MessageEnvelope, options?: OutboxAppendOptions): Promise<void> {
    await this.appendWith(unitOfWork.session, envelope, options)
  }

  async claim(options: ClaimOptions): Promise<StoredMessage[]>
  async claim(message: MessageEnvelope, options: {
    owner: string
    token: string
    now: string
    leaseUntil: string
  }): Promise<InboxClaim>
  async claim(first: MessageEnvelope | ClaimOptions, second?: {
    owner: string
    token: string
    now: string
    leaseUntil: string
  }): Promise<StoredMessage[] | InboxClaim> {
    if (!('version' in first))
      return this.claimOutbox(first)
    const o = second!
    const leaseToken = `${o.token}:${first.id}`
    const inserted = rows(await this.database.execute(sql`insert into reliability_messages (kind, id, message_type, envelope, state, attempts, available_at, lease_owner, lease_token, lease_until) values ('inbox', ${first.id}, ${first.type}, ${JSON.stringify(first)}, 'processing', 1, ${o.now}, ${o.owner}, ${leaseToken}, ${o.leaseUntil}) on conflict (kind, id) do nothing returning attempts, lease_token`))[0]
    if (inserted)
      return { status: 'claimed', attempts: Number(inserted.attempts), leaseToken: String(inserted.lease_token) }
    const existing = rows(await this.database.execute(sql`select state, available_at, lease_until from reliability_messages where kind = 'inbox' and id = ${first.id} limit 1`))[0]
    if (!existing || existing.state === 'delivered' || existing.state === 'dead')
      return { status: 'duplicate' }
    if (
      (existing.state === 'processing' && Date.parse(String(existing.lease_until)) > Date.parse(o.now))
      || (existing.state === 'pending' && Date.parse(String(existing.available_at)) > Date.parse(o.now))
    )
      return { status: 'busy' }
    const reclaimed = rows(await this.database.execute(sql`update reliability_messages set state = 'processing', attempts = attempts + 1, lease_owner = ${o.owner}, lease_token = ${leaseToken}, lease_until = ${o.leaseUntil} where kind = 'inbox' and id = ${first.id} and ((state = 'pending' and available_at <= ${o.now}) or (state = 'processing' and lease_until <= ${o.now})) returning attempts, lease_token`))[0]
    return reclaimed ? { status: 'claimed', attempts: Number(reclaimed.attempts), leaseToken: String(reclaimed.lease_token) } : { status: 'busy' }
  }

  protected abstract claimOutbox(options: ClaimOptions): Promise<StoredMessage[]>
  protected map(result: unknown) {
    return rows(result).map(stored)
  }

  async delivered(namespace: MessageNamespace, id: string, token: string, now: string) {
    await this.transition(namespace, id, token, now, sql`state = 'delivered', terminal_at = ${canonicalIso(now, 'now')}, lease_owner = null, lease_token = null, lease_until = null`)
  }

  async renew(namespace: MessageNamespace, id: string, token: string, now: string, leaseUntil: string) {
    await this.transition(namespace, id, token, now, sql`lease_until = case when lease_until < ${leaseUntil} then ${leaseUntil} else lease_until end`)
  }

  async retry(namespace: MessageNamespace, id: string, token: string, now: string, availableAt: string, error: string) {
    await this.transition(namespace, id, token, now, sql`state = 'pending', terminal_at = null, available_at = ${availableAt}, last_error = ${sanitizeErrorSummary(error)}, lease_owner = null, lease_token = null, lease_until = null`)
  }

  async dead(namespace: MessageNamespace, id: string, token: string, now: string, error: string) {
    await this.transition(namespace, id, token, now, sql`state = 'dead', terminal_at = ${canonicalIso(now, 'now')}, last_error = ${sanitizeErrorSummary(error)}, lease_owner = null, lease_token = null, lease_until = null`)
  }

  async prune(options: ReliabilityPruneOptions): Promise<ReliabilityPruneResult> {
    const o = normalizeReliabilityPruneOptions(options)
    const states = sql`state in (${sql.join(o.states.map(state => sql`${state}`), sql`, `)})`
    const types = o.types ? sql`and message_type in (${sql.join(o.types.map(type => sql`${type}`), sql`, `)})` : sql``
    const deleted = rows(await this.database.execute(sql`delete from reliability_messages where kind = ${o.namespace} and id in (select id from reliability_messages where kind = ${o.namespace} and ${states} and terminal_at < ${o.completedBefore} ${types} order by terminal_at, id limit ${o.limit}) returning id`)).length
    const remaining = rows(await this.database.execute(sql`select id from reliability_messages where kind = ${o.namespace} and ${states} and terminal_at < ${o.completedBefore} ${types} limit 1`)).length > 0
    return { deleted, hasMore: remaining }
  }

  private async transition(namespace: MessageNamespace, id: string, token: string, now: string, values: SQL) {
    const result = await this.database.execute(sql`update reliability_messages set ${values} where kind = ${namespace} and id = ${id} and state = 'processing' and lease_token = ${token} and lease_until > ${now} returning id`)
    if (!rows(result).length)
      throw new Error('Message lease lost')
  }
}

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | {
  readonly [key: string]: JsonValue
}
export type MessageContext = Readonly<{
  executionId?: string
  correlationId?: string
  causationId?: string
  tenantId?: string
  traceId?: string
  actor?: Readonly<{
    type: string
    id: string
  }>
}>
export type MessageEnvelope<T extends JsonValue = JsonValue> = Readonly<{
  version: 1
  id: string
  type: string
  occurredAt: string
  payload: T
  context?: MessageContext
}>
export type MessageState = 'pending' | 'processing' | 'delivered' | 'dead'
export type MessageNamespace = 'outbox' | 'inbox'
export interface StoredMessage {
  readonly envelope: MessageEnvelope
  readonly state: MessageState
  readonly attempts: number
  readonly availableAt: string
  readonly leaseOwner?: string
  readonly leaseToken?: string
  readonly leaseUntil?: string
  readonly lastError?: string
}
export type ContextSnapshot = Readonly<Record<string, unknown>>
const ID = /^\w[\w.:-]{0,127}$/
function assertJson(value: unknown, seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number' && Number.isFinite(value))
    return
  if (typeof value !== 'object' || seen.has(value))
    throw new TypeError('Message payload must be JSON-safe')
  seen.add(value)
  if (Array.isArray(value))
    value.forEach(item => assertJson(item, seen))
  else {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      throw new TypeError('Message payload must be JSON-safe')
    Object.values(value).forEach(item => assertJson(item, seen))
  }
  seen.delete(value)
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}
const optionalId = (value: unknown): string | undefined => typeof value === 'string' && ID.test(value) ? value : undefined
export function createEnvelope<T extends JsonValue>(input: {
  id?: string
  type: string
  payload: T
  occurredAt?: string
  context?: ContextSnapshot
}, idFactory: () => string = () => crypto.randomUUID()): MessageEnvelope<T> {
  assertJson(input.payload)
  const id = input.id ?? idFactory()
  if (!ID.test(id) || !ID.test(input.type))
    throw new TypeError('Invalid message id or type')
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  if (new Date(occurredAt).toISOString() !== occurredAt)
    throw new TypeError('Invalid occurredAt')
  const c = input.context
  const context = c && { executionId: optionalId(c.executionId), correlationId: optionalId(c.correlationId), causationId: optionalId(c.causationId), tenantId: optionalId(c.tenantId), traceId: optionalId(c.traceId), actor: c.actor && typeof c.actor === 'object'
    ? (() => {
        const a = c.actor as Record<string, unknown>
        const id = optionalId(a.id)
        const type = optionalId(a.type)
        return id && type ? { id, type } : undefined
      })()
    : undefined }
  const cleanContext = context && Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) as MessageContext
  return Object.freeze({ version: 1, id, type: input.type, occurredAt, payload: deepFreeze(structuredClone(input.payload)), ...(cleanContext && Object.keys(cleanContext).length ? { context: deepFreeze(cleanContext) } : {}) })
}
export type ClaimOptions = {
  owner: string
  token: string
  limit: number
  now: string
  leaseUntil: string
  types?: readonly string[]
}
export interface OutboxStore {
  readonly durability?: 'durable' | 'volatile'
  append(envelope: MessageEnvelope): Promise<void>
  claim(options: ClaimOptions): Promise<StoredMessage[]>
  delivered(namespace: MessageNamespace, id: string, token: string, now: string): Promise<void>
  retry(namespace: MessageNamespace, id: string, token: string, now: string, availableAt: string, error: string): Promise<void>
  dead(namespace: MessageNamespace, id: string, token: string, now: string, error: string): Promise<void>
}
export type InboxClaim = {
  status: 'claimed'
  attempts: number
  leaseToken: string
} | {
  status: 'duplicate' | 'busy'
}
export interface InboxStore {
  readonly durability?: 'durable' | 'volatile'
  claim(message: MessageEnvelope, options: {
    owner: string
    token: string
    now: string
    leaseUntil: string
  }): Promise<InboxClaim>
  delivered(namespace: MessageNamespace, id: string, token: string, now: string): Promise<void>
  retry(namespace: MessageNamespace, id: string, token: string, now: string, availableAt: string, error: string): Promise<void>
  dead(namespace: MessageNamespace, id: string, token: string, now: string, error: string): Promise<void>
}
export type DeliveryResult = {
  ok: true
} | {
  ok: false
  retryable: boolean
  error: string
  retryAt?: string
}
export class OutboxProcessor {
  constructor(private readonly store: OutboxStore, private readonly deliver: (message: MessageEnvelope) => Promise<DeliveryResult>, private readonly options: {
    owner: string
    leaseMs?: number
    limit?: number
    types?: readonly string[]
    maxAttempts?: number
    retryDelayMs?: (attempt: number) => number
    clock?: () => Date
  }) { }

  async runOnce(): Promise<{
    claimed: number
    delivered: number
    retried: number
    dead: number
  }> {
    const clock = this.options.clock ?? (() => new Date())
    const now = clock()
    const token = crypto.randomUUID()
    const rows = await this.store.claim({ owner: this.options.owner, token, limit: this.options.limit ?? 10, now: now.toISOString(), leaseUntil: new Date(now.getTime() + (this.options.leaseMs ?? 30000)).toISOString(), ...(this.options.types ? { types: this.options.types } : {}) })
    const result = { claimed: rows.length, delivered: 0, retried: 0, dead: 0 }
    for (const row of rows) {
      const leaseToken = row.leaseToken!
      try {
        const delivery = await this.deliver(row.envelope)
        const transitionNow = clock().toISOString()
        if (delivery.ok) {
          await this.store.delivered('outbox', row.envelope.id, leaseToken, transitionNow)
          result.delivered++
          continue
        }
        const terminal = !delivery.retryable || row.attempts >= (this.options.maxAttempts ?? 10)
        if (terminal) {
          await this.store.dead('outbox', row.envelope.id, leaseToken, transitionNow, delivery.error)
          result.dead++
        }
        else {
          const at = delivery.retryAt ?? new Date(clock().getTime() + (this.options.retryDelayMs?.(row.attempts) ?? Math.min(60000, 1000 * 2 ** (row.attempts - 1)))).toISOString()
          await this.store.retry('outbox', row.envelope.id, leaseToken, transitionNow, at, delivery.error)
          result.retried++
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : 'Delivery failed'
        const transitionNow = clock().toISOString()
        if (row.attempts >= (this.options.maxAttempts ?? 10)) {
          await this.store.dead('outbox', row.envelope.id, leaseToken, transitionNow, message)
          result.dead++
        }
        else {
          await this.store.retry('outbox', row.envelope.id, leaseToken, transitionNow, new Date(clock().getTime() + 1000).toISOString(), message)
          result.retried++
        }
      }
    }
    return result
  }
}
export class InboxConsumer {
  constructor(private readonly store: InboxStore, private readonly handle: (message: MessageEnvelope) => Promise<void>, private readonly options: {
    owner: string
    leaseMs?: number
    maxAttempts?: number
    clock?: () => Date
  }) { }

  async consume(message: MessageEnvelope): Promise<'delivered' | 'duplicate' | 'busy' | 'retry' | 'dead'> {
    const clock = this.options.clock ?? (() => new Date())
    const now = clock()
    const token = crypto.randomUUID()
    const claim = await this.store.claim(message, { owner: this.options.owner, token, now: now.toISOString(), leaseUntil: new Date(now.getTime() + (this.options.leaseMs ?? 30000)).toISOString() })
    if (claim.status !== 'claimed')
      return claim.status
    try {
      await this.handle(message)
      await this.store.delivered('inbox', message.id, claim.leaseToken, clock().toISOString())
      return 'delivered'
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : 'Consumer failed'
      const transitionNow = clock().toISOString()
      if (claim.attempts >= (this.options.maxAttempts ?? 10)) {
        await this.store.dead('inbox', message.id, claim.leaseToken, transitionNow, detail)
        return 'dead'
      }
      await this.store.retry('inbox', message.id, claim.leaseToken, transitionNow, new Date(now.getTime() + 1000).toISOString(), detail)
      return 'retry'
    }
  }
}

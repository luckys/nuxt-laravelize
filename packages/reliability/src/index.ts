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
export interface OutboxAppendOptions { availableAt?: string }
export class OutboxMessageConflictError extends Error {
  constructor(id: string) {
    super(`Outbox message ID already exists with different content or availability: ${id}`)
    this.name = 'OutboxMessageConflictError'
  }
}
export type ContextSnapshot = Readonly<Record<string, unknown>>
const ID = /^\w[\w.:-]{0,127}$/
const JSON_LIMITS = { bytes: 262_144, string: 65_536, depth: 32, nodes: 10_000, keys: 1_000, array: 10_000 } as const
function assertJson(value: unknown): asserts value is JsonValue {
  const stack: Array<{ value?: unknown, depth: number, exit?: object }> = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let nodes = 0
  let bytes = 0
  while (stack.length) {
    const current = stack.pop()!
    if (current.exit) {
      seen.delete(current.exit)
      continue
    }
    nodes++
    if (nodes > JSON_LIMITS.nodes || current.depth > JSON_LIMITS.depth)
      throw new TypeError('Message payload exceeds structural limits')
    if (current.value === null || typeof current.value === 'boolean') continue
    if (typeof current.value === 'number') {
      if (!Number.isFinite(current.value)) throw new TypeError('Message payload must be JSON-safe')
      bytes += 16
      continue
    }
    if (typeof current.value === 'string') {
      if (current.value.length > JSON_LIMITS.string) throw new TypeError('Message payload string is too large')
      bytes += Buffer.byteLength(current.value)
      if (bytes > JSON_LIMITS.bytes) throw new TypeError('Message payload is too large')
      continue
    }
    if (typeof current.value !== 'object' || seen.has(current.value)) throw new TypeError('Message payload must be JSON-safe')
    seen.add(current.value)
    stack.push({ depth: current.depth, exit: current.value })
    if (Array.isArray(current.value)) {
      if (current.value.length > JSON_LIMITS.array) throw new TypeError('Message payload array is too large')
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 })
      continue
    }
    if (Object.getPrototypeOf(current.value) !== Object.prototype) throw new TypeError('Message payload must be JSON-safe')
    const entries = Object.entries(current.value)
    if (entries.length > JSON_LIMITS.keys) throw new TypeError('Message payload has too many keys')
    for (const [key, item] of entries) {
      bytes += Buffer.byteLength(key)
      stack.push({ value: item, depth: current.depth + 1 })
    }
    if (bytes > JSON_LIMITS.bytes) throw new TypeError('Message payload is too large')
  }
}
function deepFreeze<T>(value: T): T {
  const stack: object[] = value && typeof value === 'object' ? [value] : []
  while (stack.length) {
    const current = stack.pop()!
    for (const child of Object.values(current)) if (child && typeof child === 'object') stack.push(child)
    Object.freeze(current)
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
export function canonicalizeEnvelope(envelope: MessageEnvelope): string {
  const normalized = createEnvelope({ id: envelope.id, type: envelope.type, occurredAt: envelope.occurredAt, payload: envelope.payload, context: envelope.context })
  const canonicalize = (value: JsonValue | MessageEnvelope | MessageContext): unknown => Array.isArray(value)
    ? value.map(item => canonicalize(item))
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize((value as Record<string, JsonValue>)[key]!)]))
      : value
  return JSON.stringify(canonicalize(normalized))
}
export type ClaimOptions = {
  owner: string
  token: string
  limit: number
  now: string
  leaseUntil: string
  types?: readonly string[]
  excludeIds?: readonly string[]
}
export interface OutboxStore {
  readonly durability?: 'durable' | 'volatile'
  append(envelope: MessageEnvelope, options?: OutboxAppendOptions): Promise<void>
  claim(options: ClaimOptions): Promise<StoredMessage[]>
  renew(namespace: MessageNamespace, id: string, token: string, now: string, leaseUntil: string): Promise<void>
  delivered(namespace: MessageNamespace, id: string, token: string, now: string): Promise<void>
  retry(namespace: MessageNamespace, id: string, token: string, now: string, availableAt: string, error: string): Promise<void>
  dead(namespace: MessageNamespace, id: string, token: string, now: string, error: string): Promise<void>
}
export type TerminalMessageState = 'delivered' | 'dead'
export interface ReliabilityPruneOptions {
  namespace: MessageNamespace
  completedBefore: string
  states: readonly TerminalMessageState[]
  limit?: number
  types?: readonly string[]
}
export interface ReliabilityPruneResult { deleted: number, hasMore: boolean }
export interface PrunableReliabilityStore {
  prune(options: ReliabilityPruneOptions): Promise<ReliabilityPruneResult>
}
export type NormalizedReliabilityPruneOptions = Required<Pick<ReliabilityPruneOptions, 'namespace' | 'completedBefore' | 'states' | 'limit'>> & Pick<ReliabilityPruneOptions, 'types'>
export function normalizeReliabilityPruneOptions(options: ReliabilityPruneOptions): NormalizedReliabilityPruneOptions {
  if (options.namespace !== 'outbox' && options.namespace !== 'inbox') throw new TypeError('namespace must be outbox or inbox')
  const completedBefore = new Date(options.completedBefore)
  if (!Number.isFinite(completedBefore.getTime()) || completedBefore.toISOString() !== options.completedBefore) throw new TypeError('completedBefore must be a canonical ISO timestamp')
  const states = [...new Set(options.states)]
  if (!states.length || states.some(state => state !== 'delivered' && state !== 'dead')) throw new TypeError('states must contain delivered or dead')
  const limit = boundedInteger(options.limit ?? 100, 'limit', 1000)
  const types = options.types ? [...new Set(options.types)] : undefined
  if (types && (!types.length || types.length > 100 || types.some(type => !ID.test(type)))) throw new TypeError('types must contain between 1 and 100 valid message types')
  return { namespace: options.namespace, completedBefore: options.completedBefore, states, limit, ...(types ? { types } : {}) }
}
export function isPrunableReliabilityStore(store: unknown): store is PrunableReliabilityStore {
  return !!store && typeof store === 'object' && typeof (store as { prune?: unknown }).prune === 'function'
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
  renew(namespace: MessageNamespace, id: string, token: string, now: string, leaseUntil: string): Promise<void>
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
export type MessageExecutionContext = Readonly<{ signal: AbortSignal, leaseToken: string, attempt: number }>
export type OutboxOutcome = Readonly<{
  id: string
  status: 'delivered' | 'retried' | 'dead' | 'delivery-failed' | 'ack-failed' | 'delivered-ack-unknown' | 'lease-lost' | 'cancelled'
  error?: string
}>
export interface ProcessorSummary { claimed: number, delivered: number, retried: number, dead: number, outcomes: OutboxOutcome[] }
const boundedInteger = (value: number, name: string, maximum: number): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError(`${name} must be an integer between 1 and ${maximum}`)
  return value
}
export const sanitizeErrorSummary = (value: unknown, fallback = 'operation_failed'): string => {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : fallback
  return raw.replace(/https?:\/\/\S+/gi, '[url]').replace(/(token|secret|password|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]').replace(/[\r\n]/g, ' ').slice(0, 128) || fallback
}
export class OutboxProcessor {
  constructor(private readonly store: OutboxStore, private readonly deliver: (message: MessageEnvelope, context?: MessageExecutionContext) => Promise<DeliveryResult>, private readonly options: {
    owner: string
    leaseMs?: number
    limit?: number
    types?: readonly string[]
    maxAttempts?: number
    retryDelayMs?: (attempt: number) => number
    clock?: () => Date
    concurrency?: number
    signal?: AbortSignal
    heartbeatMs?: number
    context?: (message: MessageEnvelope, context: MessageExecutionContext) => MessageExecutionContext
  }) {
    const leaseMs = boundedInteger(options.leaseMs ?? 30000, 'leaseMs', 86_400_000)
    boundedInteger(options.limit ?? 10, 'limit', 1000)
    boundedInteger(options.concurrency ?? 1, 'concurrency', 100)
    boundedInteger(options.maxAttempts ?? 10, 'maxAttempts', 1000)
    const heartbeatMs = boundedInteger(options.heartbeatMs ?? Math.max(10, Math.floor(leaseMs / 3)), 'heartbeatMs', 86_400_000)
    if (heartbeatMs >= leaseMs) throw new TypeError('heartbeatMs must be less than leaseMs')
  }

  async runOnce(signal?: AbortSignal): Promise<{
    claimed: number
    delivered: number
    retried: number
    dead: number
    outcomes: OutboxOutcome[]
  }> {
    const clock = this.options.clock ?? (() => new Date())
    const token = crypto.randomUUID()
    const concurrency = this.options.concurrency ?? 1
    const limit = this.options.limit ?? 10
    const executionSignal = this.options.signal && signal ? AbortSignal.any([this.options.signal, signal]) : this.options.signal ?? signal
    if (executionSignal?.aborted) return { claimed: 0, delivered: 0, retried: 0, dead: 0, outcomes: [] }
    const result: ProcessorSummary = { claimed: 0, delivered: 0, retried: 0, dead: 0, outcomes: [] }
    const processedIds: string[] = []
    while (result.claimed < limit && !executionSignal?.aborted) {
      const now = clock()
      const capacity = Math.min(concurrency, limit - result.claimed)
      const rows = await this.store.claim({ owner: this.options.owner, token, limit: capacity, now: now.toISOString(), leaseUntil: new Date(now.getTime() + (this.options.leaseMs ?? 30000)).toISOString(), ...(this.options.types ? { types: this.options.types } : {}), ...(processedIds.length ? { excludeIds: processedIds } : {}) })
      if (!rows.length) break
      processedIds.push(...rows.map(row => row.envelope.id))
      result.claimed += rows.length
      await Promise.all(rows.map(async (row) => {
        const leaseToken = row.leaseToken!
        const controller = new AbortController()
        const abort = () => controller.abort(executionSignal?.reason)
        executionSignal?.addEventListener('abort', abort, { once: true })
        let leaseLost = false
        const leaseMs = this.options.leaseMs ?? 30000
        let renewal = Promise.resolve()
        const renew = () => {
          const heartbeatNow = clock()
          renewal = renewal.then(() => this.store.renew('outbox', row.envelope.id, leaseToken, heartbeatNow.toISOString(), new Date(heartbeatNow.getTime() + leaseMs).toISOString())).catch(() => {
            leaseLost = true
            controller.abort(new Error('Message lease lost'))
          })
        }
        const heartbeat = setInterval(renew, this.options.heartbeatMs ?? Math.max(10, Math.floor(leaseMs / 3)))
        let deliveryCompleted = false
        try {
          const base = { signal: controller.signal, leaseToken, attempt: row.attempts }
          const delivery = await this.deliver(row.envelope, this.options.context?.(row.envelope, base) ?? base)
          deliveryCompleted = true
          clearInterval(heartbeat)
          await renewal
          const transitionNow = clock().toISOString()
          if (leaseLost) {
            result.outcomes.push({ id: row.envelope.id, status: 'lease-lost' })
            return
          }
          if (delivery.ok) {
            try {
              await this.store.delivered('outbox', row.envelope.id, leaseToken, transitionNow)
              result.delivered++
              result.outcomes.push({ id: row.envelope.id, status: 'delivered' })
            }
            catch (error) {
              result.outcomes.push({ id: row.envelope.id, status: 'delivered-ack-unknown', error: sanitizeErrorSummary(error, 'acknowledgement_failed') })
            }
            return
          }
          const terminal = !delivery.retryable || row.attempts >= (this.options.maxAttempts ?? 10)
          const deliveryError = sanitizeErrorSummary(delivery.error, 'delivery_failed')
          if (terminal) {
            await this.store.dead('outbox', row.envelope.id, leaseToken, transitionNow, deliveryError)
            result.dead++
            result.outcomes.push({ id: row.envelope.id, status: 'dead', error: deliveryError })
          }
          else {
            const delay = boundedInteger(this.options.retryDelayMs?.(row.attempts) ?? Math.min(60000, 1000 * 2 ** (row.attempts - 1)), 'retryDelayMs', 86_400_000)
            const at = delivery.retryAt ?? new Date(clock().getTime() + delay).toISOString()
            await this.store.retry('outbox', row.envelope.id, leaseToken, transitionNow, at, deliveryError)
            result.retried++
            result.outcomes.push({ id: row.envelope.id, status: 'retried', error: deliveryError })
          }
        }
        catch (error) {
          clearInterval(heartbeat)
          await renewal
          if (controller.signal.aborted) {
            result.outcomes.push({ id: row.envelope.id, status: leaseLost ? 'lease-lost' : 'cancelled' })
            return
          }
          const message = sanitizeErrorSummary(error, 'delivery_failed')
          if (deliveryCompleted) {
            result.outcomes.push({ id: row.envelope.id, status: 'ack-failed', error: message })
            return
          }
          const transitionNow = clock().toISOString()
          if (row.attempts >= (this.options.maxAttempts ?? 10)) {
            await this.store.dead('outbox', row.envelope.id, leaseToken, transitionNow, message)
            result.dead++
            result.outcomes.push({ id: row.envelope.id, status: 'dead', error: message })
          }
          else {
            await this.store.retry('outbox', row.envelope.id, leaseToken, transitionNow, new Date(clock().getTime() + 1000).toISOString(), message)
            result.retried++
            result.outcomes.push({ id: row.envelope.id, status: 'delivery-failed', error: message })
          }
        }
        finally {
          clearInterval(heartbeat)
          executionSignal?.removeEventListener('abort', abort)
        }
      }))
      if (rows.length < capacity) break
    }
    return result
  }
}
export class InboxConsumer {
  constructor(private readonly store: InboxStore, private readonly handle: (message: MessageEnvelope, context?: MessageExecutionContext) => Promise<void>, private readonly options: {
    owner: string
    leaseMs?: number
    maxAttempts?: number
    clock?: () => Date
    retryDelayMs?: (attempt: number) => number
    heartbeatMs?: number
    signal?: AbortSignal
    context?: (message: MessageEnvelope, context: MessageExecutionContext) => MessageExecutionContext
  }) {
    const leaseMs = boundedInteger(options.leaseMs ?? 30000, 'leaseMs', 86_400_000)
    boundedInteger(options.maxAttempts ?? 10, 'maxAttempts', 1000)
    const heartbeatMs = boundedInteger(options.heartbeatMs ?? Math.max(10, Math.floor(leaseMs / 3)), 'heartbeatMs', 86_400_000)
    if (heartbeatMs >= leaseMs) throw new TypeError('heartbeatMs must be less than leaseMs')
  }

  async consume(message: MessageEnvelope): Promise<'delivered' | 'duplicate' | 'busy' | 'retry' | 'dead'> {
    const clock = this.options.clock ?? (() => new Date())
    if (this.options.signal?.aborted) return 'busy'
    const now = clock()
    const token = crypto.randomUUID()
    const claim = await this.store.claim(message, { owner: this.options.owner, token, now: now.toISOString(), leaseUntil: new Date(now.getTime() + (this.options.leaseMs ?? 30000)).toISOString() })
    if (claim.status !== 'claimed')
      return claim.status
    const controller = new AbortController()
    const abort = () => controller.abort(this.options.signal?.reason)
    this.options.signal?.addEventListener('abort', abort, { once: true })
    let leaseLost = false
    const leaseMs = this.options.leaseMs ?? 30000
    let renewal = Promise.resolve()
    const renew = () => {
      const heartbeatNow = clock()
      renewal = renewal.then(() => this.store.renew('inbox', message.id, claim.leaseToken, heartbeatNow.toISOString(), new Date(heartbeatNow.getTime() + leaseMs).toISOString())).catch(() => {
        leaseLost = true
        controller.abort()
      })
    }
    const heartbeat = setInterval(renew, this.options.heartbeatMs ?? Math.max(10, Math.floor(leaseMs / 3)))
    try {
      const base = { signal: controller.signal, leaseToken: claim.leaseToken, attempt: claim.attempts }
      await this.handle(message, this.options.context?.(message, base) ?? base)
      clearInterval(heartbeat)
      await renewal
      if (leaseLost) return 'busy'
      await this.store.delivered('inbox', message.id, claim.leaseToken, clock().toISOString())
      return 'delivered'
    }
    catch (error) {
      clearInterval(heartbeat)
      await renewal
      if (leaseLost || controller.signal.aborted) return 'busy'
      const failure = toConsumerFailure(error)
      const detail = sanitizeErrorSummary(failure.error, 'consumer_failed')
      const transitionNow = clock().toISOString()
      if (!failure.retryable || claim.attempts >= (this.options.maxAttempts ?? 10)) {
        await this.store.dead('inbox', message.id, claim.leaseToken, transitionNow, detail)
        return 'dead'
      }
      const retryDelayMs = boundedInteger(this.options.retryDelayMs?.(claim.attempts) ?? 1000, 'retryDelayMs', 86_400_000)
      const retryAt = failure.retryAt ?? new Date(clock().getTime() + retryDelayMs).toISOString()
      await this.store.retry('inbox', message.id, claim.leaseToken, transitionNow, retryAt, detail)
      return 'retry'
    }
    finally {
      clearInterval(heartbeat)
      this.options.signal?.removeEventListener('abort', abort)
    }
  }
}

export class ConsumerFailure extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAt?: string) {
    super(message)
  }
}
const errorDetail = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
const toConsumerFailure = (error: unknown) => error instanceof ConsumerFailure
  ? { error: error.message, retryable: error.retryable, retryAt: error.retryAt }
  : { error: errorDetail(error, 'Consumer failed'), retryable: true, retryAt: undefined }

export class OutboxWorker {
  #running?: Promise<ProcessorSummary>
  #controller = new AbortController()
  constructor(private readonly processor: OutboxProcessor, private readonly options: { intervalMs?: number } = {}) {
    boundedInteger(options.intervalMs ?? 1000, 'intervalMs', 86_400_000)
  }

  runOnce(): Promise<ProcessorSummary> {
    return this.#running ??= this.processor.runOnce(this.#controller.signal).finally(() => {
      this.#running = undefined
    })
  }

  async run(signal?: AbortSignal): Promise<void> {
    const abort = () => this.#controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      while (!this.#controller.signal.aborted) {
        await this.runOnce()
        await abortableSleep(this.options.intervalMs ?? 1000, this.#controller.signal)
      }
    }
    catch (error) {
      if (!this.#controller.signal.aborted) throw error
    }
    finally {
      signal?.removeEventListener('abort', abort)
    }
  }

  async stop(): Promise<void> {
    this.#controller.abort()
    await this.drain()
  }

  async drain(): Promise<void> {
    await this.#running
  }
}
export const abortableSleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(signal.reason)
  const timer = setTimeout(done, ms)
  function done() {
    signal.removeEventListener('abort', aborted)
    resolve()
  }
  function aborted() {
    clearTimeout(timer)
    signal.removeEventListener('abort', aborted)
    reject(signal.reason)
  }
  signal.addEventListener('abort', aborted, { once: true })
})

import { createToken, type Logger, type Resolver } from '@nuxt-laravelize/core/runtime'
import { ExecutionContextAccessor, type ExecutionContextSnapshot } from '@nuxt-laravelize/execution-context/runtime'

export type AuditOutcome = 'success' | 'denied' | 'failure'
export type AuditScalar = string | number | boolean | null
export type AuditValue = AuditScalar | readonly AuditValue[] | { readonly [key: string]: AuditValue }
export interface AuditReference { readonly type: string, readonly id?: string }
export interface AuditChange { readonly from?: AuditValue, readonly to?: AuditValue }
export interface AuditEntry {
  readonly schemaVersion: 1
  readonly id: string
  readonly occurredAt: string
  readonly action: string
  readonly outcome: AuditOutcome
  readonly subject?: AuditReference
  readonly target?: AuditReference
  readonly changes?: Readonly<Record<string, AuditChange>>
  readonly metadata?: Readonly<Record<string, AuditValue>>
  readonly actor?: ExecutionContextSnapshot['actor']
  readonly tenantId?: string
  readonly locale?: string
  readonly executionId: string
  readonly correlationId: string
  readonly causationId?: string
  readonly source: ExecutionContextSnapshot['source']
  readonly traceId?: string
  readonly spanId?: string
}
export type AuditRecordInput = Pick<AuditEntry, 'action' | 'outcome' | 'subject' | 'target' | 'changes' | 'metadata'>
export interface AuditStore { append(entry: AuditEntry): Promise<void> }
export type AuditFailureMode = 'fail-closed' | 'best-effort'
export interface AuditRecorderOptions {
  readonly failureMode?: AuditFailureMode
  readonly redactionKeys?: readonly string[]
  readonly maxDepth?: number
  readonly maxKeys?: number
  readonly maxArrayLength?: number
  readonly maxNodes?: number
  readonly maxArrayElements?: number
  readonly maxSerializedBytes?: number
  readonly requireTenantId?: boolean
}

const SAFE = /^[A-Z0-9][\w.:-]*$/i
const FIELD = /^[A-Z0-9][\w.-]*$/i
const DENIED = /password|passwd|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|session/i
const REDACTED = '[REDACTED]'
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const INPUT_KEYS = new Set(['action', 'outcome', 'subject', 'target', 'changes', 'metadata'])
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`Audit ${name} must be a finite positive integer`)
}
function ownEnumerableKeys(value: object): string[] {
  const symbols = Object.getOwnPropertySymbols(value).filter(symbol => Object.prototype.propertyIsEnumerable.call(value, symbol))
  if (symbols.length) throw new TypeError('Audit objects cannot contain enumerable symbol keys')
  return Object.keys(value)
}
function assertSafeKey(key: string): void {
  if (RESERVED_KEYS.has(key)) throw new TypeError(`reserved audit key: ${key}`)
}
function safeText(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !SAFE.test(value)) throw new TypeError(`Invalid audit ${name}`)
  return value
}
function reference(value: AuditReference | undefined, name: string): AuditReference | undefined {
  if (value === undefined) return undefined
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`Audit ${name} must be a plain object`)
  const keys = ownEnumerableKeys(value)
  if (keys.some(key => key !== 'type' && key !== 'id')) throw new TypeError(`Invalid audit ${name} key`)
  return Object.freeze({ type: safeText(value.type, `${name}.type`, 64), ...(value.id === undefined ? {} : { id: safeText(value.id, `${name}.id`, 128) }) })
}
function sanitizer(options: Required<Pick<AuditRecorderOptions, 'maxDepth' | 'maxKeys' | 'maxArrayLength' | 'maxNodes' | 'maxArrayElements' | 'maxSerializedBytes'>> & { redactionKeys: Set<string> }) {
  let keys = 0
  let nodes = 0
  let arrayElements = 0
  let primitiveBytes = 0
  const encoder = new TextEncoder()
  const visit = (value: unknown, depth: number, key?: string, preserveKey = false): AuditValue => {
    if (depth > options.maxDepth) throw new TypeError('Audit value exceeds maximum depth')
    if (++nodes > options.maxNodes) throw new TypeError('Audit value exceeds global node budget')
    if (key && !preserveKey && (DENIED.test(key) || options.redactionKeys.has(key.toLowerCase()))) return REDACTED
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      primitiveBytes += encoder.encode(JSON.stringify(value)).length
      if (primitiveBytes > options.maxSerializedBytes) throw new TypeError('Audit value exceeds serialized size')
      return value
    }
    if (typeof value !== 'object') throw new TypeError('Audit values must be JSON-safe')
    if (Array.isArray(value)) {
      if (value.length > options.maxArrayLength) throw new TypeError('Audit array is too large')
      arrayElements += value.length
      if (arrayElements > options.maxArrayElements) throw new TypeError('Audit value exceeds global array element budget')
      return value.map(item => visit(item, depth + 1))
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Audit objects must be plain objects')
    const output = Object.create(null) as Record<string, AuditValue>
    for (const childKey of ownEnumerableKeys(value)) {
      assertSafeKey(childKey)
      if (!FIELD.test(childKey) || childKey.length > 64 || ++keys > options.maxKeys) throw new TypeError('Invalid or excessive audit keys')
      Object.defineProperty(output, childKey, { value: visit((value as Record<string, unknown>)[childKey], depth + 1, childKey, depth === 0 && preserveKey), enumerable: true, writable: true, configurable: true })
    }
    return output
  }
  return (value: unknown, preserveRootKeys = false): AuditValue => {
    const result = visit(value, 0, undefined, preserveRootKeys)
    if (encoder.encode(JSON.stringify(result)).length > options.maxSerializedBytes) throw new TypeError('Audit value exceeds serialized size')
    return result
  }
}

export class DefaultAuditRecorder {
  readonly #options: Required<Pick<AuditRecorderOptions, 'failureMode' | 'maxDepth' | 'maxKeys' | 'maxArrayLength' | 'maxNodes' | 'maxArrayElements' | 'maxSerializedBytes' | 'requireTenantId'>> & { redactionKeys: Set<string> }
  constructor(private readonly store: AuditStore, private readonly contexts: ExecutionContextAccessor, private readonly logger: Logger, options: AuditRecorderOptions = {}, private readonly idFactory: () => string = () => globalThis.crypto.randomUUID(), private readonly now: () => Date = () => new Date()) {
    this.#options = { failureMode: options.failureMode ?? 'fail-closed', maxDepth: options.maxDepth ?? 5, maxKeys: options.maxKeys ?? 100, maxArrayLength: options.maxArrayLength ?? 50, maxNodes: options.maxNodes ?? 500, maxArrayElements: options.maxArrayElements ?? 250, maxSerializedBytes: options.maxSerializedBytes ?? 16_384, requireTenantId: options.requireTenantId ?? false, redactionKeys: new Set((options.redactionKeys ?? []).map(key => key.toLowerCase())) }
    for (const name of ['maxDepth', 'maxKeys', 'maxArrayLength', 'maxNodes', 'maxArrayElements', 'maxSerializedBytes'] as const) assertPositiveInteger(this.#options[name], name)
  }

  async record(input: AuditRecordInput): Promise<AuditEntry> {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError('Audit input must be a plain object')
    const inputKeys = ownEnumerableKeys(input)
    const invalidInputKey = inputKeys.find(key => !INPUT_KEYS.has(key))
    if (invalidInputKey) throw new TypeError(`Invalid audit input key: ${invalidInputKey}`)
    const context = this.contexts.current().snapshot()
    if (this.#options.requireTenantId && !context.tenantId) throw new TypeError('Audit tenant is required')
    const clean = sanitizer(this.#options)
    const changes = input.changes === undefined ? undefined : clean(this.#validateChanges(input.changes), true) as Readonly<Record<string, AuditChange>>
    const metadata = input.metadata === undefined ? undefined : clean(input.metadata) as Readonly<Record<string, AuditValue>>
    const entry: AuditEntry = Object.freeze({ schemaVersion: 1, id: safeText(this.idFactory(), 'id', 128), occurredAt: this.now().toISOString(), action: safeText(input.action, 'action', 128), outcome: outcome(input.outcome), ...(reference(input.subject, 'subject') ? { subject: reference(input.subject, 'subject') } : {}), ...(reference(input.target, 'target') ? { target: reference(input.target, 'target') } : {}), ...(changes ? { changes } : {}), ...(metadata ? { metadata } : {}), ...(context.actor ? { actor: context.actor } : {}), ...(context.tenantId ? { tenantId: context.tenantId } : {}), ...(context.locale ? { locale: context.locale } : {}), executionId: context.executionId, correlationId: context.correlationId, ...(context.causationId ? { causationId: context.causationId } : {}), source: context.source, ...(context.traceId ? { traceId: context.traceId } : {}), ...(context.spanId ? { spanId: context.spanId } : {}) })
    try {
      await this.store.append(structuredClone(entry))
    }
    catch (error) {
      if (this.#options.failureMode === 'fail-closed') throw error
      this.logger.error('Audit entry could not be persisted', { errorType: error instanceof Error ? error.name : 'UnknownError' })
    }
    return structuredClone(entry)
  }

  #validateChanges(changes: Readonly<Record<string, AuditChange>>): Readonly<Record<string, AuditChange>> {
    if (!changes || Object.getPrototypeOf(changes) !== Object.prototype) throw new TypeError('Audit changes must be a plain object')
    return Object.fromEntries(ownEnumerableKeys(changes).map((field) => {
      assertSafeKey(field)
      const change = changes[field]
      if (!FIELD.test(field) || field.length > 64 || !change || Object.getPrototypeOf(change) !== Object.prototype) throw new TypeError('Invalid audit change')
      const changeKeys = ownEnumerableKeys(change)
      changeKeys.forEach(assertSafeKey)
      if (changeKeys.length === 0 || changeKeys.some(key => key !== 'from' && key !== 'to')) throw new TypeError('Audit changes require only from/to values')
      if (DENIED.test(field) || this.#options.redactionKeys.has(field.toLowerCase())) {
        return [field, Object.fromEntries(changeKeys.map(key => [key, REDACTED]))]
      }
      return [field, change]
    }))
  }
}
function outcome(value: unknown): AuditOutcome {
  if (value !== 'success' && value !== 'denied' && value !== 'failure') throw new TypeError('Invalid audit outcome')
  return value
}

export class InMemoryAuditStore implements AuditStore {
  #entries: AuditEntry[] = []
  constructor(private readonly capacity = 1_000) { assertPositiveInteger(capacity, 'memory capacity') }
  async append(entry: AuditEntry): Promise<void> {
    if (this.#entries.length >= this.capacity) throw new Error('Audit in-memory store capacity reached; evidence was not persisted')
    this.#entries.push(structuredClone(entry))
  }

  all(): readonly AuditEntry[] { return structuredClone(this.#entries) }
  reset(): void { this.#entries = [] }
}
export class DisabledAuditStore implements AuditStore {
  async append(): Promise<void> { throw new Error('Audit recording is disabled; configure a durable store or laravelizeAudit.driver="memory" explicitly') }
}

export const auditStoreToken = createToken<AuditStore>('laravelize.audit.store')
export const auditRecorderToken = createToken<DefaultAuditRecorder>('laravelize.audit.recorder')
export function makeAuditRecorder(resolver: Resolver, logger: Logger, options?: AuditRecorderOptions): DefaultAuditRecorder {
  return new DefaultAuditRecorder(resolver.make(auditStoreToken), new ExecutionContextAccessor(resolver), logger, options)
}

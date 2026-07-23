/* eslint-disable @stylistic/max-statements-per-line, @stylistic/lines-between-class-members, @stylistic/brace-style, unicorn/error-message */
export type DeadLetterDisposition = 'active' | 'discarded'
export type DeadLetterKey = Readonly<{ source: string, namespace: string, id: string }>
export type DeadLetterSummary = Readonly<{
  key: DeadLetterKey
  type: string
  disposition: DeadLetterDisposition
  attempts: number
  terminalAt: string
  availableAt?: string
  error?: string
  revision: string
  tenantHint?: string
}>
export type DeadLetterDetail = DeadLetterSummary & Readonly<{ payload?: unknown }>
export type DeadLetterFilters = Readonly<{ namespace?: string, type?: string, disposition?: DeadLetterDisposition, includeTenantHint?: boolean }>
export type DeadLetterListRequest = DeadLetterFilters & Readonly<{ source?: string, cursor?: string, limit?: number, includeErrorSummary?: boolean }>
export type DeadLetterPage = Readonly<{ items: readonly DeadLetterSummary[], nextCursor?: string }>
export type DeadLetterMutation = Readonly<{ key: DeadLetterKey, revision: string, operationId: string, reason?: string }>
export type DeadLetterRetry = DeadLetterMutation & Readonly<{ availableAt: string }>
export type DeadLetterMutationResult = Readonly<{ key: DeadLetterKey, disposition: DeadLetterDisposition, revision: string, operationId: string, committedAt: string }>

export class DeadLetterNotFoundError extends Error { constructor() { super('Dead letter not found'); this.name = 'DeadLetterNotFoundError' } }
export class DeadLetterStaleRevisionError extends Error { constructor() { super('Dead letter revision is stale'); this.name = 'DeadLetterStaleRevisionError' } }
export class DeadLetterInvalidStateError extends Error { constructor() { super('Dead letter is not in a valid state for this operation'); this.name = 'DeadLetterInvalidStateError' } }
export class DeadLetterOperationConflictError extends Error { constructor() { super('Operation ID was already used with different parameters'); this.name = 'DeadLetterOperationConflictError' } }
export class DeadLetterAmbiguousError extends Error { constructor(message = 'Dead-letter operation outcome is ambiguous') { super(message); this.name = 'DeadLetterAmbiguousError' } }
export class DeadLetterUnmanagedLegacyError extends Error { constructor() { super('Dead letter has no terminal timestamp and must be explicitly backfilled or migrated by an administrator'); this.name = 'DeadLetterUnmanagedLegacyError' } }
export class DeadLetterAdapterError extends Error { constructor() { super('Dead-letter adapter operation failed'); this.name = 'DeadLetterAdapterError' } }

export interface DeadLetterAdapter {
  readonly source: string
  list(request: Omit<DeadLetterListRequest, 'source' | 'cursor'> & { cursor?: string }): Promise<DeadLetterPage>
  get(key: DeadLetterKey, options?: { includePayload?: boolean, includeTenantHint?: boolean, includeErrorSummary?: boolean }): Promise<DeadLetterDetail>
  retry(request: DeadLetterRetry): Promise<DeadLetterMutationResult>
  discard(request: DeadLetterMutation): Promise<DeadLetterMutationResult>
}
export type DeadLetterOperationEvent = Readonly<{ operation: 'list' | 'get' | 'retry' | 'discard', source: string, outcome: 'succeeded' | 'failed', committed?: boolean }>
export interface DeadLetterOperationObserver { observe(event: DeadLetterOperationEvent): void | Promise<void> }
export type DeadLetterOperationReceipt = Readonly<{ fingerprint: string, status: 'pending' | 'committed' | 'failed', result?: DeadLetterMutationResult, failureCode?: 'not_found' | 'stale_revision' | 'invalid_state' }>
export interface DeadLetterOperationStore {
  get(operationId: string): Promise<DeadLetterOperationReceipt | undefined>
  reserve(operationId: string, fingerprint: string): Promise<'reserved' | 'exists'>
  finalize(operationId: string, fingerprint: string, resolution: { status: 'committed', result: DeadLetterMutationResult } | { status: 'failed', failureCode: NonNullable<DeadLetterOperationReceipt['failureCode']> }): Promise<void>
}

const NAME = /^[a-z][a-z0-9-]{0,62}$/
const VALUE = /^[\w.:-]{1,128}$/
const RESERVED = new Set(['all', 'default', 'none', 'system'])
const canonicalIso = (value: string, name: string) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError(`${name} must be a canonical ISO timestamp`)
  return value
}
const bounded = (value: string | undefined, name: string, maximum: number, pattern?: RegExp) => {
  if (value !== undefined && (!value.length || value.length > maximum || (pattern && !pattern.test(value)))) throw new TypeError(`Invalid ${name}`)
}
export const sanitizeDeadLetterError = (value: unknown): string | undefined => {
  if (value == null) return undefined
  const text = (value instanceof Error ? value.message : String(value)).replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/\S+/gi, '[database-url]').replace(/https?:\/\/\S+/gi, '[url]').replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[jwt]').replace(/(api[-_ ]?key|access[-_ ]?key|token|secret|password|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]').replace(/[\r\n\t]/g, ' ').slice(0, 256).trim()
  return text || undefined
}
export const validateDeadLetterKey = (key: DeadLetterKey): DeadLetterKey => {
  if (!NAME.test(key.source) || RESERVED.has(key.source)) throw new TypeError('Invalid dead-letter source')
  bounded(key.namespace, 'namespace', 64, VALUE); bounded(key.id, 'id', 128, VALUE)
  return key
}
export const validateMutation = <T extends DeadLetterMutation>(request: T): T => {
  validateDeadLetterKey(request.key); bounded(request.revision, 'revision', 512); bounded(request.operationId, 'operationId', 128, VALUE); bounded(request.reason, 'reason', 512)
  if ('availableAt' in request) canonicalIso((request as DeadLetterRetry).availableAt, 'availableAt')
  return request
}
const safeSummary = (item: DeadLetterSummary, includeTenantHint = false, includeErrorSummary = false): DeadLetterSummary => {
  validateDeadLetterKey(item.key)
  bounded(item.type, 'type', 128, VALUE)
  bounded(item.revision, 'revision', 512)
  canonicalIso(item.terminalAt, 'terminalAt')
  if (item.availableAt) canonicalIso(item.availableAt, 'availableAt')
  if (!Number.isSafeInteger(item.attempts) || item.attempts < 0) throw new TypeError('Invalid attempts')
  if (item.disposition !== 'active' && item.disposition !== 'discarded') throw new TypeError('Invalid disposition')
  return { key: item.key, type: item.type, disposition: item.disposition, attempts: item.attempts, terminalAt: item.terminalAt, ...(item.availableAt ? { availableAt: item.availableAt } : {}), ...(includeErrorSummary && sanitizeDeadLetterError(item.error) ? { error: sanitizeDeadLetterError(item.error) } : {}), revision: item.revision, ...(includeTenantHint && item.tenantHint ? { tenantHint: item.tenantHint.slice(0, 128) } : {}) }
}

const canonicalFingerprintValue = (action: 'retry' | 'discard', request: DeadLetterMutation) => JSON.stringify([action, request.key.source, request.key.namespace, request.key.id, request.revision, 'availableAt' in request ? request.availableAt : null, request.reason ?? null])
export const deadLetterOperationFingerprint = async (action: 'retry' | 'discard', request: DeadLetterMutation): Promise<string> => {
  const bytes = new TextEncoder().encode(canonicalFingerprintValue(action, request))
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable')
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

type Cursor = { v: 1, source: string, value: string }
export const encodeDeadLetterCursor = (source: string, value: string): string => {
  if (!NAME.test(source) || RESERVED.has(source) || !value || value.length > 512) throw new TypeError('Invalid cursor data')
  return Buffer.from(JSON.stringify({ v: 1, source, value } satisfies Cursor)).toString('base64url')
}
export const decodeDeadLetterCursor = (cursor: string, source: string): string => {
  if (typeof cursor !== 'string' || !cursor.length || cursor.length > 1024) throw new TypeError('Invalid cursor')
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).sort().join(',') !== 'source,v,value' || (parsed as Cursor).v !== 1 || (parsed as Cursor).source !== source || typeof (parsed as Cursor).value !== 'string' || !(parsed as Cursor).value.length || (parsed as Cursor).value.length > 512) throw new Error()
    return (parsed as Cursor).value
  }
  catch { throw new TypeError('Invalid cursor') }
}

export class DeadLetterAdapterRegistry {
  readonly #adapters = new Map<string, DeadLetterAdapter>()
  register(adapter: DeadLetterAdapter): this {
    if (!NAME.test(adapter.source) || RESERVED.has(adapter.source)) throw new TypeError('Invalid or reserved dead-letter source')
    if (this.#adapters.has(adapter.source)) throw new TypeError(`Duplicate dead-letter source: ${adapter.source}`)
    this.#adapters.set(adapter.source, adapter); return this
  }
  get(source: string): DeadLetterAdapter { const adapter = this.#adapters.get(source); if (!adapter) throw new TypeError(`Unknown dead-letter source: ${source}`); return adapter }
  sources(): readonly string[] { return [...this.#adapters.keys()] }
}

export class DeadLetterManager {
  constructor(private readonly registry: DeadLetterAdapterRegistry, private readonly observer?: DeadLetterOperationObserver) {}
  async list(request: DeadLetterListRequest = {}): Promise<DeadLetterPage> {
    const source = request.source ?? (this.registry.sources().length === 1 ? this.registry.sources()[0] : undefined)
    if (!source) throw new TypeError('source is required unless exactly one adapter is registered')
    const limit = request.limit ?? 25
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('limit must be between 1 and 100')
    bounded(request.namespace, 'namespace', 64, VALUE); bounded(request.type, 'type', 128, VALUE)
    if (request.disposition && request.disposition !== 'active' && request.disposition !== 'discarded') throw new TypeError('Invalid disposition')
    const cursor = request.cursor ? decodeDeadLetterCursor(request.cursor, source) : undefined
    return this.run('list', source, async () => {
      const { source: _source, ...adapterRequest } = request
      const page = await this.registry.get(source).list({ ...adapterRequest, cursor: cursor ?? undefined, limit })
      return { items: page.items.map(item => safeSummary(item, request.includeTenantHint, request.includeErrorSummary)), ...(page.nextCursor ? { nextCursor: encodeDeadLetterCursor(source, page.nextCursor) } : {}) }
    })
  }
  get(key: DeadLetterKey, options?: { includePayload?: boolean, includeTenantHint?: boolean, includeErrorSummary?: boolean }) {
    validateDeadLetterKey(key)
    return this.run('get', key.source, async () => {
      const detail = await this.registry.get(key.source).get(key, options)
      return { ...safeSummary(detail, options?.includeTenantHint, options?.includeErrorSummary), ...(options?.includePayload && 'payload' in detail ? { payload: detail.payload } : {}) }
    })
  }
  retry(request: DeadLetterRetry) { validateMutation(request); return this.run('retry', request.key.source, async () => this.safeMutation('retry', await this.registry.get(request.key.source).retry(request), request), true) }
  discard(request: DeadLetterMutation) { validateMutation(request); return this.run('discard', request.key.source, async () => this.safeMutation('discard', await this.registry.get(request.key.source).discard(request), request), true) }
  private safeMutation(action: 'retry' | 'discard', result: DeadLetterMutationResult, request: DeadLetterMutation): DeadLetterMutationResult {
    if (result.key.source !== request.key.source || result.key.namespace !== request.key.namespace || result.key.id !== request.key.id || result.operationId !== request.operationId) throw new DeadLetterAdapterError()
    validateDeadLetterKey(result.key); bounded(result.revision, 'revision', 512); canonicalIso(result.committedAt, 'committedAt')
    if (result.disposition !== (action === 'retry' ? 'active' : 'discarded')) throw new DeadLetterAdapterError()
    return { key: { ...result.key }, disposition: result.disposition, revision: result.revision, operationId: result.operationId, committedAt: result.committedAt }
  }
  private async run<T>(operation: DeadLetterOperationEvent['operation'], source: string, action: () => Promise<T>, mutation = false): Promise<T> {
    try { const result = await action(); await this.observe({ operation, source, outcome: 'succeeded', ...(mutation ? { committed: true } : {}) }); return result }
    catch (error) { await this.observe({ operation, source, outcome: 'failed' }); if (error instanceof DeadLetterNotFoundError || error instanceof DeadLetterStaleRevisionError || error instanceof DeadLetterInvalidStateError || error instanceof DeadLetterOperationConflictError || error instanceof DeadLetterAmbiguousError || error instanceof DeadLetterUnmanagedLegacyError || error instanceof DeadLetterAdapterError || error instanceof TypeError) throw error; throw new DeadLetterAdapterError() }
  }
  private async observe(event: DeadLetterOperationEvent) { try { await this.observer?.observe(event) } catch { /* fail-safe: committed operations are not rolled back */ } }
}

export const DEAD_LETTER_ABILITIES = Object.freeze(['dead-letters.list', 'dead-letters.view', 'dead-letters.view-payload', 'dead-letters.retry', 'dead-letters.discard', 'dead-letters.retry-inbox'] as const)

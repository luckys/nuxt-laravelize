export type Actor = Readonly<{ type: 'user' | 'service' | 'system', id: string }>
export type ExecutionSource = Readonly<{ type: 'http' | 'queue' | 'scheduler' | 'cli' | 'test', name?: string }>
export interface ExecutionContextSnapshot {
  readonly version: 1
  readonly executionId: string
  readonly correlationId: string
  readonly causationId?: string
  readonly actor?: Actor
  readonly tenantId?: string
  readonly source: ExecutionSource
  readonly startedAt: string
  readonly traceId?: string
  readonly spanId?: string
  readonly attributes?: Readonly<Record<string, string>>
}
export type IdFactory = () => string
export type ExecutionContextInput = Omit<ExecutionContextSnapshot, 'version' | 'executionId' | 'correlationId' | 'startedAt'> & Partial<Pick<ExecutionContextSnapshot, 'executionId' | 'correlationId' | 'startedAt'>>
const ID = /^\w[\w.:-]{0,127}$/
const MAX_ATTRIBUTES = 16
const MAX_ATTRIBUTE_LENGTH = 256
const uuid: IdFactory = () => globalThis.crypto.randomUUID()

function text(value: unknown, field: string, max = 128): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !ID.test(value)) throw new TypeError(`Invalid execution context ${field}`)
  return value
}
function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : text(value, field)
}

export class ExecutionContext {
  readonly #value: ExecutionContextSnapshot
  private constructor(value: ExecutionContextSnapshot) { this.#value = Object.freeze(value) }

  static create(input: ExecutionContextInput, idFactory: IdFactory = uuid): ExecutionContext {
    const attributes = input.attributes
    if (attributes && (Object.getPrototypeOf(attributes) !== Object.prototype || Object.keys(attributes).length > MAX_ATTRIBUTES)) throw new TypeError('Invalid execution context attributes')
    const safeAttributes = attributes && Object.fromEntries(Object.entries(attributes).map(([key, value]) => {
      if (!ID.test(key) || typeof value !== 'string' || value.length > MAX_ATTRIBUTE_LENGTH) throw new TypeError('Invalid execution context attribute')
      return [key, value]
    }))
    const startedAt = input.startedAt ?? new Date().toISOString()
    if (Number.isNaN(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) throw new TypeError('Invalid execution context startedAt')
    if (!input.source || !['http', 'queue', 'scheduler', 'cli', 'test'].includes(input.source.type)) throw new TypeError('Invalid execution context source')
    const source = Object.freeze({ type: input.source.type, ...(input.source.name ? { name: text(input.source.name, 'source.name') } : {}) })
    const actor = input.actor && Object.freeze({ type: input.actor.type, id: text(input.actor.id, 'actor.id') })
    if (actor && !['user', 'service', 'system'].includes(actor.type)) throw new TypeError('Invalid execution context actor.type')
    const value: ExecutionContextSnapshot = {
      version: 1, executionId: text(input.executionId ?? idFactory(), 'executionId'), correlationId: text(input.correlationId ?? idFactory(), 'correlationId'),
      ...(optionalText(input.causationId, 'causationId') ? { causationId: input.causationId } : {}), ...(actor ? { actor } : {}),
      ...(optionalText(input.tenantId, 'tenantId') ? { tenantId: input.tenantId } : {}), source, startedAt,
      ...(optionalText(input.traceId, 'traceId') ? { traceId: input.traceId } : {}), ...(optionalText(input.spanId, 'spanId') ? { spanId: input.spanId } : {}),
      ...(safeAttributes ? { attributes: Object.freeze(safeAttributes) } : {}),
    }
    return new ExecutionContext(value)
  }

  static from(snapshot: ExecutionContextSnapshot): ExecutionContext {
    if (snapshot.version !== 1) throw new TypeError('Unsupported execution context version')
    return ExecutionContext.create(snapshot)
  }

  snapshot(): ExecutionContextSnapshot { return structuredClone(this.#value) }
  derive(input: Partial<Pick<ExecutionContextInput, 'actor' | 'tenantId' | 'source' | 'traceId' | 'spanId' | 'attributes'>> = {}, idFactory: IdFactory = uuid): ExecutionContext {
    return ExecutionContext.create({ ...this.#value, ...input, executionId: idFactory(), correlationId: this.#value.correlationId, causationId: this.#value.executionId, startedAt: undefined }, idFactory)
  }

  enrich(input: Pick<ExecutionContextInput, 'actor' | 'tenantId'>): ExecutionContext { return ExecutionContext.create({ ...this.#value, ...input }) }
}

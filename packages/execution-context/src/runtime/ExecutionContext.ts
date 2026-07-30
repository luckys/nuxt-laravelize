export type Actor = Readonly<{ type: 'user' | 'service' | 'system', id: string }>
export type ExecutionSource = Readonly<{ type: 'http' | 'queue' | 'scheduler' | 'cli' | 'test', name?: string }>
export interface ExecutionContextSnapshot {
  readonly version: 1
  readonly executionId: string
  readonly correlationId: string
  readonly causationId?: string
  readonly actor?: Actor
  readonly tenantId?: string
  readonly locale?: string
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
const MAX_LOCALE_LENGTH = 35
const uuid: IdFactory = () => globalThis.crypto.randomUUID()

function text(value: unknown, field: string, max = 128): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !ID.test(value)) throw new TypeError(`Invalid execution context ${field}`)
  return value
}
function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : text(value, field)
}
function optionalLocale(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < 2 || value.length > MAX_LOCALE_LENGTH) throw new TypeError('Invalid execution context locale')
  try {
    return Intl.getCanonicalLocales(value)[0]
  }
  catch {
    throw new TypeError('Invalid execution context locale')
  }
}

function dataObject(value: unknown, required: readonly string[], allowed: readonly string[]): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid execution context snapshot')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(value)
  if (required.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key)) || keys.some(key => typeof key !== 'string' || !allowed.includes(key)) || Object.values(descriptors).some(descriptor => !('value' in descriptor) || !descriptor.enumerable)) throw new TypeError('Invalid execution context snapshot')
  return descriptors
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
    const locale = optionalLocale(input.locale)
    const value: ExecutionContextSnapshot = {
      version: 1, executionId: text(input.executionId ?? idFactory(), 'executionId'), correlationId: text(input.correlationId ?? idFactory(), 'correlationId'),
      ...(optionalText(input.causationId, 'causationId') ? { causationId: input.causationId } : {}), ...(actor ? { actor } : {}),
      ...(optionalText(input.tenantId, 'tenantId') ? { tenantId: input.tenantId } : {}), ...(locale ? { locale } : {}), source, startedAt,
      ...(optionalText(input.traceId, 'traceId') ? { traceId: input.traceId } : {}), ...(optionalText(input.spanId, 'spanId') ? { spanId: input.spanId } : {}),
      ...(safeAttributes ? { attributes: Object.freeze(safeAttributes) } : {}),
    }
    return new ExecutionContext(value)
  }

  static from(snapshot: ExecutionContextSnapshot): ExecutionContext {
    const required = ['version', 'executionId', 'correlationId', 'source', 'startedAt']
    const allowed = [...required, 'causationId', 'actor', 'tenantId', 'locale', 'traceId', 'spanId', 'attributes']
    const descriptors = dataObject(snapshot, required, allowed)
    if (descriptors.version?.value !== 1 || allowed.slice(required.length).some(key => descriptors[key] && descriptors[key].value == null)) throw new TypeError('Invalid execution context snapshot')
    const source = dataObject(descriptors.source?.value, ['type'], ['type', 'name'])
    if (source.name) text(source.name.value, 'source.name')
    if (descriptors.actor) dataObject(descriptors.actor.value, ['type', 'id'], ['type', 'id'])
    if (descriptors.attributes) {
      const attributes = descriptors.attributes.value
      dataObject(attributes, [], Object.keys(attributes))
    }
    return ExecutionContext.create(snapshot)
  }

  snapshot(): ExecutionContextSnapshot { return structuredClone(this.#value) }
  derive(input: Partial<Pick<ExecutionContextInput, 'actor' | 'tenantId' | 'locale' | 'source' | 'traceId' | 'spanId' | 'attributes'>> = {}, idFactory: IdFactory = uuid): ExecutionContext {
    return ExecutionContext.create({ ...this.#value, ...input, executionId: idFactory(), correlationId: this.#value.correlationId, causationId: this.#value.executionId, startedAt: undefined }, idFactory)
  }

  enrich(input: Partial<Pick<ExecutionContextInput, 'actor' | 'tenantId' | 'locale'>>): ExecutionContext { return ExecutionContext.create({ ...this.#value, ...input }) }
  withTrace(traceId: string, spanId: string): ExecutionContext { return ExecutionContext.create({ ...this.#value, traceId, spanId }) }
}

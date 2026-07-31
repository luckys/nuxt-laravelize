import { Job, type JobSerializer, type SerializedJob } from './Job'
import { MAX_JOB_PRIORITY, type PushOptions, type QueueChainStep } from './Queue'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export const MAX_QUEUE_CHAIN_STEPS = 100
export const MAX_QUEUE_CHAIN_BYTES = 245_760
export const MAX_QUEUE_CHAIN_NODES = 8_000
export const MAX_QUEUE_CHAIN_DEPTH = 24
export const QUEUE_CHAIN_KIND = 'nuxt-laravelize.queue-chain'
export const QUEUE_CHAIN_JOB_ID_PREFIX = 'laravelize-chain-'

export interface ResolvedQueueChainOptions {
  readonly tries: number
  readonly delay: number
  readonly queue: string
  readonly backoff: number | readonly number[]
  readonly priority: number
}

export interface PreparedQueueChainStep {
  readonly serialized: SerializedJob
  readonly options: ResolvedQueueChainOptions
}

export interface QueueChainEnvelopeV1 {
  readonly kind: typeof QUEUE_CHAIN_KIND
  readonly version: 1
  readonly id: string
  readonly index: number
  readonly steps: readonly PreparedQueueChainStep[]
  readonly fingerprint: `sha256:${string}`
}

type SerializeChainJob = (job: Job, queue: string, serializer: JobSerializer) => SerializedJob
const CHAIN_ID = /^[A-Z0-9][\w-]{0,127}$/i
const CHAIN_FINGERPRINT = /^sha256:[a-f0-9]{64}$/
const EMPTY_CHAIN_FINGERPRINT: `sha256:${string}` = `sha256:${'0'.repeat(64)}`
const CHAIN_OPTION_KEYS = new Set(['tries', 'delay', 'queue', 'backoff', 'priority'])

export function prepareQueueChain(
  steps: readonly QueueChainStep[],
  serializer: JobSerializer,
  serialize: SerializeChainJob,
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
): QueueChainEnvelopeV1 {
  if (!isPlainDataArray(steps) || steps.length < 1) throw new TypeError('Queue chain must contain at least 1 step')
  if (steps.length > MAX_QUEUE_CHAIN_STEPS) throw new TypeError(`Queue chain must contain at most ${MAX_QUEUE_CHAIN_STEPS} steps`)
  const id = idFactory()
  if (typeof id !== 'string' || !CHAIN_ID.test(id)) throw new TypeError('Queue chain id must be a safe identifier of at most 128 characters')
  const prepared: PreparedQueueChainStep[] = []
  for (const step of steps) {
    if (!step || Object.getPrototypeOf(step) !== Object.prototype || !hasAllowedDataKeys(step, ['job', 'options']) || !(step.job instanceof Job)) throw new TypeError('Queue chain step is invalid')
    const options = resolveQueueChainOptions(step.job, step.options)
    prepared.push({ serialized: serialize(step.job, options.queue, serializer), options })
    assertChainSize({ kind: QUEUE_CHAIN_KIND, version: 1, id, index: steps.length - 1, steps: prepared, fingerprint: EMPTY_CHAIN_FINGERPRINT })
  }
  return createQueueChainEnvelope(id, 0, prepared)
}

export function readQueueChainEnvelope(value: unknown): QueueChainEnvelopeV1 | undefined {
  if (!value || typeof value !== 'object') return undefined
  const kind = Object.getOwnPropertyDescriptor(value, 'kind')
  if (!kind || !('value' in kind) || kind.value !== QUEUE_CHAIN_KIND) return undefined
  if (Object.getPrototypeOf(value) !== Object.prototype || !hasExactKeys(value, ['kind', 'version', 'id', 'index', 'steps', 'fingerprint'])) throw new TypeError('Invalid queue chain envelope')
  const envelope = value as Partial<QueueChainEnvelopeV1>
  if (envelope.version !== 1 || typeof envelope.id !== 'string' || !CHAIN_ID.test(envelope.id) || !Number.isSafeInteger(envelope.index) || !isPlainDataArray(envelope.steps) || envelope.steps.length < 1 || envelope.steps.length > MAX_QUEUE_CHAIN_STEPS || envelope.index! < 0 || envelope.index! >= envelope.steps.length || typeof envelope.fingerprint !== 'string' || !CHAIN_FINGERPRINT.test(envelope.fingerprint)) throw new TypeError('Invalid queue chain envelope')
  for (const step of envelope.steps) {
    if (!step || Object.getPrototypeOf(step) !== Object.prototype || !hasExactKeys(step, ['serialized', 'options'])) throw new TypeError('Invalid queue chain envelope')
    assertSerializedShape(step.serialized)
    assertResolvedOptions(step.options)
  }
  assertChainSize(envelope as QueueChainEnvelopeV1)
  if (envelope.fingerprint !== fingerprintQueueChain(envelope.id, envelope.index!, envelope.steps as readonly PreparedQueueChainStep[])) throw new TypeError('Invalid queue chain envelope')
  return envelope as QueueChainEnvelopeV1
}

export function currentQueueChainStep(envelope: QueueChainEnvelopeV1): PreparedQueueChainStep {
  return envelope.steps[envelope.index]!
}

export function nextQueueChainEnvelope(envelope: QueueChainEnvelopeV1): QueueChainEnvelopeV1 | undefined {
  if (envelope.index + 1 >= envelope.steps.length) return undefined
  return createQueueChainEnvelope(envelope.id, envelope.index + 1, envelope.steps)
}

export function queueChainJobId(envelope: QueueChainEnvelopeV1): string {
  return `${QUEUE_CHAIN_JOB_ID_PREFIX}${envelope.id}-${envelope.index}`
}

function resolveQueueChainOptions(job: Job, value: QueueChainStep['options']): ResolvedQueueChainOptions {
  if (value !== undefined && (!value || Object.getPrototypeOf(value) !== Object.prototype)) throw new TypeError('Queue chain step options must be a plain object')
  const options = (value ?? {}) as PushOptions
  if (Object.prototype.hasOwnProperty.call(options, 'id') || Object.prototype.hasOwnProperty.call(options, 'deduplication')) throw new TypeError('Queue chain step id and deduplication are not supported')
  if (!Reflect.ownKeys(options).every((key) => {
    if (typeof key !== 'string' || !CHAIN_OPTION_KEYS.has(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(options, key)
    return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable)
  })) throw new TypeError('Queue chain step options are invalid')
  const config = job.constructor as typeof Job
  const queue = options.queue ?? config.queue
  if (typeof queue !== 'string' || queue.length > 256 || /[\r\n\0]/.test(queue)) throw new TypeError('queue must be a string of at most 256 characters')
  return {
    tries: integer(options.tries ?? config.tries, 'tries', 1, 1000),
    delay: integer(options.delay ?? config.delay, 'delay', 0, 86_400_000),
    queue,
    backoff: readBackoff(options.backoff ?? config.backoff),
    priority: integer(options.priority ?? config.priority, 'priority', 0, MAX_JOB_PRIORITY),
  }
}

function readBackoff(value: number | readonly number[]): number | readonly number[] {
  if (typeof value === 'number') return integer(value, 'backoff', 0, 86_400_000)
  if (!isPlainDataArray(value) || value.length > 1000) throw new TypeError('backoff must contain at most 1000 entries')
  return value.map(item => integer(item, 'backoff', 0, 86_400_000))
}

function assertResolvedOptions(value: unknown): asserts value is ResolvedQueueChainOptions {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !hasExactKeys(value, ['tries', 'delay', 'queue', 'backoff', 'priority'])) throw new TypeError('Invalid queue chain envelope')
  const options = value as Partial<ResolvedQueueChainOptions>
  try {
    integer(options.tries!, 'tries', 1, 1000)
    integer(options.delay!, 'delay', 0, 86_400_000)
    integer(options.priority!, 'priority', 0, MAX_JOB_PRIORITY)
    readBackoff(options.backoff!)
  }
  catch { throw new TypeError('Invalid queue chain envelope') }
  if (typeof options.queue !== 'string' || options.queue.length > 256 || /[\r\n\0]/.test(options.queue)) throw new TypeError('Invalid queue chain envelope')
}

function assertSerializedShape(value: unknown): asserts value is SerializedJob {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid queue chain envelope')
  const version = Object.getOwnPropertyDescriptor(value, 'version')
  if (!version || !('value' in version) || !version.enumerable || (version.value !== 1 && version.value !== 2)) throw new TypeError('Invalid queue chain envelope')
}

function assertChainSize(value: QueueChainEnvelopeV1): void {
  try {
    measureChain(value, { nodes: 0 }, 0)
    const json = JSON.stringify(value)
    if (new TextEncoder().encode(json).byteLength > MAX_QUEUE_CHAIN_BYTES) throw new TypeError('Queue chain envelope is too large')
  }
  catch (error) {
    if (error instanceof TypeError && (error.message === 'Queue chain envelope is too large' || error.message === 'Queue chain envelope is too complex')) throw error
    throw new TypeError('Invalid queue chain envelope')
  }
}

function measureChain(value: unknown, state: { nodes: number }, depth: number): void {
  if (depth > MAX_QUEUE_CHAIN_DEPTH || ++state.nodes > MAX_QUEUE_CHAIN_NODES) throw new TypeError('Queue chain envelope is too complex')
  if (!value || typeof value !== 'object') return
  for (const item of Array.isArray(value) ? value : Object.values(value)) measureChain(item, state, depth + 1)
}

function createQueueChainEnvelope(id: string, index: number, steps: readonly PreparedQueueChainStep[]): QueueChainEnvelopeV1 {
  return { kind: QUEUE_CHAIN_KIND, version: 1, id, index, steps, fingerprint: fingerprintQueueChain(id, index, steps) }
}

function fingerprintQueueChain(id: string, index: number, steps: readonly PreparedQueueChainStep[]): `sha256:${string}` {
  const domain = new TextEncoder().encode('nuxt-laravelize:queue-chain:v1\0')
  const body = new TextEncoder().encode(JSON.stringify([id, index, steps]))
  const input = new Uint8Array(domain.byteLength + body.byteLength)
  input.set(domain)
  input.set(body, domain.byteLength)
  return `sha256:${bytesToHex(sha256(input))}`
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value)
  return keys.length === expected.length && expected.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable)
  })
}

function hasAllowedDataKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value)
  return keys.length >= 1 && keys.every((key) => {
    if (typeof key !== 'string' || !allowed.includes(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable)
  }) && Object.prototype.hasOwnProperty.call(value, 'job')
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false
  }
  return true
}

function integer(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`)
  return value
}

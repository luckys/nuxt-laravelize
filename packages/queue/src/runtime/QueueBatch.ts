/* eslint-disable @stylistic/max-statements-per-line */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { createToken, type Token } from '@nuxt-laravelize/core/runtime'
import { Job, type JobSerializer, type SerializedJob } from './Job'
import { MAX_JOB_PRIORITY, type JobHandle, type PushOptions } from './Queue'

export const MAX_QUEUE_BATCH_ITEMS = 100
export const MAX_QUEUE_BATCH_BYTES = 245_760
export const MAX_QUEUE_BATCH_NODES = 8_000
export const MAX_QUEUE_BATCH_DEPTH = 24
export const QUEUE_BATCH_CHILD_KIND = 'nuxt-laravelize.queue-batch-child'
export const QUEUE_BATCH_COORDINATOR_KIND = 'nuxt-laravelize.queue-batch-coordinator'
export const QUEUE_BATCH_JOB_ID_PREFIX = 'laravelize-batch-'

export type QueueBatchItemOptions = Pick<PushOptions, 'tries' | 'delay' | 'backoff' | 'priority'>
export interface QueueBatchItem { readonly job: Job, readonly options?: QueueBatchItemOptions }
export interface QueueBatchOptions { readonly queue?: string }
export type QueueBatchHandle = JobHandle
export type QueueBatchState = 'running' | 'cancelling' | 'finished' | 'cancelled'
export interface QueueBatchSnapshot {
  readonly total: number
  readonly pending: number
  readonly succeeded: number
  readonly failed: number
  readonly cancelled: number
  readonly cancellationRequested: boolean
  readonly state: QueueBatchState
}

export interface ResolvedQueueBatchItemOptions {
  readonly tries: number
  readonly delay: number
  readonly backoff: number | readonly number[]
  readonly priority: number
}

export interface QueueBatchChildEnvelopeV1 {
  readonly kind: typeof QUEUE_BATCH_CHILD_KIND
  readonly version: 1
  readonly id: string
  readonly index: number
  readonly total: number
  readonly serialized: SerializedJob
  readonly options: ResolvedQueueBatchItemOptions
  readonly fingerprint: `sha256:${string}`
}

export interface QueueBatchCoordinatorEnvelopeV1 {
  readonly kind: typeof QUEUE_BATCH_COORDINATOR_KIND
  readonly version: 1
  readonly id: string
  readonly queue: string
  readonly total: number
  readonly cancellationRequested: boolean
  readonly fingerprint: `sha256:${string}`
}

export interface PreparedQueueBatch {
  readonly handle: QueueBatchHandle
  readonly coordinator: QueueBatchCoordinatorEnvelopeV1
  readonly children: readonly QueueBatchChildEnvelopeV1[]
}

export interface QueueBatchContext {
  readonly id: string
  readonly queue: string
  isCancellationRequested(): Promise<boolean>
  throwIfCancellationRequested(): Promise<void>
}

export const queueBatchContextToken: Token<QueueBatchContext> = createToken('laravelize.queue.batch-context')

export class QueueBatchCancelledError extends Error {
  readonly code = 'QUEUE_BATCH_CANCELLED'
  constructor() { super('Queue batch cancellation requested.'); this.name = 'QueueBatchCancelledError' }
}

export function isQueueBatchCancelledError(value: unknown): value is QueueBatchCancelledError {
  return value instanceof QueueBatchCancelledError || (value instanceof Error && (value as Error & { code?: string }).code === 'QUEUE_BATCH_CANCELLED')
}

type SerializeBatchJob = (job: Job, queue: string, serializer: JobSerializer) => SerializedJob
const SAFE_ID = /^[A-Z0-9][\w-]{0,127}$/i
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/
const ITEM_KEYS = new Set(['tries', 'delay', 'backoff', 'priority'])

export function prepareQueueBatch(
  items: readonly QueueBatchItem[],
  batchOptions: QueueBatchOptions | undefined,
  serializer: JobSerializer,
  serialize: SerializeBatchJob,
  idFactory: () => string = () => globalThis.crypto.randomUUID(),
): PreparedQueueBatch {
  if (!isPlainArray(items) || items.length < 1) throw new TypeError('Queue batch must contain at least 1 item')
  if (items.length > MAX_QUEUE_BATCH_ITEMS) throw new TypeError(`Queue batch must contain at most ${MAX_QUEUE_BATCH_ITEMS} items`)
  assertBatchOptions(batchOptions)
  const id = idFactory()
  if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new TypeError('Queue batch id must be a safe identifier of at most 128 characters')
  const first = items[0]
  if (!validItem(first)) throw new TypeError('Queue batch item is invalid')
  const queue = batchOptions?.queue ?? (first.job.constructor as typeof Job).queue
  assertQueue(queue)
  const children: QueueBatchChildEnvelopeV1[] = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (!validItem(item)) throw new TypeError('Queue batch item is invalid')
    const options = resolveItemOptions(item.job, item.options)
    const serialized = serialize(item.job, queue, serializer)
    children.push(createChild(id, index, items.length, serialized, options))
    assertBatchBounds({ coordinator: createQueueBatchCoordinator(id, queue, items.length, false), children })
  }
  const coordinator = createQueueBatchCoordinator(id, queue, items.length, false)
  assertBatchBounds({ coordinator, children })
  return { handle: { id, queue }, coordinator, children }
}

export function readQueueBatchChildEnvelope(value: unknown): QueueBatchChildEnvelopeV1 | undefined {
  if (!hasKind(value, QUEUE_BATCH_CHILD_KIND)) return undefined
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype || !exactKeys(value, ['kind', 'version', 'id', 'index', 'total', 'serialized', 'options', 'fingerprint'])) throw new Error('Invalid child shape')
    const child = value as Partial<QueueBatchChildEnvelopeV1>
    if (child.version !== 1 || !safeId(child.id) || !integerIn(child.index, 0, MAX_QUEUE_BATCH_ITEMS - 1) || !integerIn(child.total, 1, MAX_QUEUE_BATCH_ITEMS) || child.index! >= child.total! || typeof child.fingerprint !== 'string' || !FINGERPRINT.test(child.fingerprint)) throw new Error('Invalid child fields')
    assertBatchBounds(child)
    assertSerialized(child.serialized)
    assertResolvedItemOptions(child.options)
    if (child.fingerprint !== childFingerprint(child.id!, child.index!, child.total!, child.serialized!, child.options!)) throw new Error('Invalid child fingerprint')
    return child as QueueBatchChildEnvelopeV1
  }
  catch { throw new TypeError('Invalid queue batch child envelope') }
}

export function readQueueBatchCoordinatorEnvelope(value: unknown): QueueBatchCoordinatorEnvelopeV1 | undefined {
  if (!hasKind(value, QUEUE_BATCH_COORDINATOR_KIND)) return undefined
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype || !exactKeys(value, ['kind', 'version', 'id', 'queue', 'total', 'cancellationRequested', 'fingerprint'])) throw new Error('Invalid coordinator shape')
    const coordinator = value as Partial<QueueBatchCoordinatorEnvelopeV1>
    if (coordinator.version !== 1 || !safeId(coordinator.id) || typeof coordinator.queue !== 'string' || !integerIn(coordinator.total, 1, MAX_QUEUE_BATCH_ITEMS) || typeof coordinator.cancellationRequested !== 'boolean' || typeof coordinator.fingerprint !== 'string' || !FINGERPRINT.test(coordinator.fingerprint)) throw new Error('Invalid coordinator fields')
    assertQueue(coordinator.queue)
    assertBatchBounds(coordinator)
    if (coordinator.fingerprint !== coordinatorFingerprint(coordinator.id!, coordinator.queue, coordinator.total!, coordinator.cancellationRequested)) throw new Error('Invalid coordinator fingerprint')
    return coordinator as QueueBatchCoordinatorEnvelopeV1
  }
  catch { throw new TypeError('Invalid queue batch coordinator envelope') }
}

export function createQueueBatchCoordinator(id: string, queue: string, total: number, cancellationRequested: boolean): QueueBatchCoordinatorEnvelopeV1 {
  if (!safeId(id)) throw new TypeError('Queue batch id must be a safe identifier of at most 128 characters')
  assertQueue(queue)
  integer(total, 'total', 1, MAX_QUEUE_BATCH_ITEMS)
  if (typeof cancellationRequested !== 'boolean') throw new TypeError('cancellationRequested must be a boolean')
  return { kind: QUEUE_BATCH_COORDINATOR_KIND, version: 1, id, queue, total, cancellationRequested, fingerprint: coordinatorFingerprint(id, queue, total, cancellationRequested) }
}

export const queueBatchChildJobId = (id: string, index: number) => `${QUEUE_BATCH_JOB_ID_PREFIX}${id}-${index}`
export const queueBatchCoordinatorJobId = (id: string) => `${QUEUE_BATCH_JOB_ID_PREFIX}${id}-coordinator`

export function queueBatchSnapshot(total: number, succeeded: number, failed: number, cancelled: number, cancellationRequested: boolean): QueueBatchSnapshot {
  if (typeof cancellationRequested !== 'boolean') throw new TypeError('Invalid queue batch counters')
  if (!integerIn(total, 1, MAX_QUEUE_BATCH_ITEMS)) throw new TypeError('Invalid queue batch counters')
  const pending = total - succeeded - failed - cancelled
  if (![total, succeeded, failed, cancelled, pending].every(value => Number.isSafeInteger(value) && value >= 0)) throw new TypeError('Invalid queue batch counters')
  const state: QueueBatchState = pending > 0 ? (cancellationRequested ? 'cancelling' : 'running') : cancelled > 0 ? 'cancelled' : 'finished'
  return { total, pending, succeeded, failed, cancelled, cancellationRequested, state }
}

function createChild(id: string, index: number, total: number, serialized: SerializedJob, options: ResolvedQueueBatchItemOptions): QueueBatchChildEnvelopeV1 {
  return { kind: QUEUE_BATCH_CHILD_KIND, version: 1, id, index, total, serialized, options, fingerprint: childFingerprint(id, index, total, serialized, options) }
}

function resolveItemOptions(job: Job, value?: QueueBatchItemOptions): ResolvedQueueBatchItemOptions {
  if (value !== undefined && (!value || Object.getPrototypeOf(value) !== Object.prototype || !Reflect.ownKeys(value).every(key => typeof key === 'string' && ITEM_KEYS.has(key) && isDataProperty(value, key)))) throw new TypeError('Queue batch item options are invalid')
  const config = job.constructor as typeof Job
  return {
    tries: integer(value?.tries ?? config.tries, 'tries', 1, 1000),
    delay: integer(value?.delay ?? config.delay, 'delay', 0, 86_400_000),
    backoff: readBackoff(value?.backoff ?? config.backoff),
    priority: integer(value?.priority ?? config.priority, 'priority', 0, MAX_JOB_PRIORITY),
  }
}

function assertResolvedItemOptions(value: unknown): asserts value is ResolvedQueueBatchItemOptions {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !exactKeys(value, ['tries', 'delay', 'backoff', 'priority'])) throw new Error('Invalid item options')
  const item = value as Partial<ResolvedQueueBatchItemOptions>
  integer(item.tries!, 'tries', 1, 1000); integer(item.delay!, 'delay', 0, 86_400_000); readBackoff(item.backoff!); integer(item.priority!, 'priority', 0, MAX_JOB_PRIORITY)
}

function readBackoff(value: number | readonly number[]): number | readonly number[] {
  if (typeof value === 'number') return integer(value, 'backoff', 0, 86_400_000)
  if (!isPlainArray(value) || value.length > 1000) throw new TypeError('backoff must contain at most 1000 entries')
  return value.map(item => integer(item, 'backoff', 0, 86_400_000))
}

function assertBatchOptions(value?: QueueBatchOptions): void {
  if (value === undefined) return
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || !Reflect.ownKeys(value).every(key => key === 'queue' && isDataProperty(value, key))) throw new TypeError('Queue batch options must contain only queue')
  if (value.queue !== undefined) assertQueue(value.queue)
}

function validItem(value: unknown): value is QueueBatchItem {
  return Boolean(value && Object.getPrototypeOf(value) === Object.prototype && exactAllowedKeys(value as object, ['job', 'options']) && (value as QueueBatchItem).job instanceof Job)
}

function assertSerialized(value: unknown): asserts value is SerializedJob {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid serialized job')
  const serialized = value as Partial<SerializedJob>
  if ((serialized.version !== 1 && serialized.version !== 2) || typeof serialized.name !== 'string' || !serialized.payload || Object.getPrototypeOf(serialized.payload) !== Object.prototype) throw new Error('Invalid serialized job fields')
}

function childFingerprint(id: string, index: number, total: number, serialized: SerializedJob, options: ResolvedQueueBatchItemOptions): `sha256:${string}` {
  return fingerprint('nuxt-laravelize:queue-batch-child:v1\0', [id, index, total, serialized, options])
}
function coordinatorFingerprint(id: string, queue: string, total: number, cancellationRequested: boolean): `sha256:${string}` {
  return fingerprint('nuxt-laravelize:queue-batch-coordinator:v1\0', [id, queue, total, cancellationRequested])
}
function fingerprint(domain: string, value: unknown): `sha256:${string}` {
  const prefix = new TextEncoder().encode(domain); const body = new TextEncoder().encode(JSON.stringify(value)); const input = new Uint8Array(prefix.length + body.length); input.set(prefix); input.set(body, prefix.length)
  return `sha256:${bytesToHex(sha256(input))}`
}

function assertBatchBounds(value: unknown): void {
  try {
    measure(value, { nodes: 0 }, 0)
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_QUEUE_BATCH_BYTES) throw new TypeError('Queue batch envelope is too large')
  }
  catch (error) {
    if (error instanceof TypeError && (error.message.includes('too large') || error.message.includes('too complex'))) throw error
    throw new TypeError('Invalid queue batch envelope')
  }
}
function measure(value: unknown, state: { nodes: number }, depth: number): void {
  if (depth > MAX_QUEUE_BATCH_DEPTH || ++state.nodes > MAX_QUEUE_BATCH_NODES) throw new TypeError('Queue batch envelope is too complex')
  if (!value || typeof value !== 'object') return
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError('Invalid queue batch envelope')
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length' && Array.isArray(value)) continue
    if (typeof key !== 'string' || !isDataProperty(value, key)) throw new TypeError('Invalid queue batch envelope')
    measure((value as Record<string, unknown>)[key], state, depth + 1)
  }
}
function hasKind(value: unknown, kind: string): value is object { const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'kind') : undefined; return Boolean(descriptor && 'value' in descriptor && descriptor.value === kind) }
function safeId(value: unknown): value is string { return typeof value === 'string' && SAFE_ID.test(value) }
function assertQueue(value: unknown): asserts value is string { if (typeof value !== 'string' || value.length > 256 || /[\r\n\0]/.test(value)) throw new TypeError('queue must be a string of at most 256 characters') }
function integerIn(value: unknown, min: number, max: number): value is number { return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max }
function integer(value: number, name: string, min: number, max: number): number { if (!integerIn(value, min, max)) throw new TypeError(`${name} must be an integer between ${min} and ${max}`); return value }
function isDataProperty(value: object, key: PropertyKey): boolean { const descriptor = Object.getOwnPropertyDescriptor(value, key); return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable) }
function exactKeys(value: object, keys: readonly string[]): boolean { return Reflect.ownKeys(value).length === keys.length && keys.every(key => isDataProperty(value, key)) }
function exactAllowedKeys(value: object, keys: readonly string[]): boolean { const actual = Reflect.ownKeys(value); return actual.length >= 1 && actual.every(key => typeof key === 'string' && keys.includes(key) && isDataProperty(value, key)) && Object.prototype.hasOwnProperty.call(value, 'job') }
function isPlainArray(value: unknown): value is readonly unknown[] { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false; return value.every((_item, index) => isDataProperty(value, String(index))) }

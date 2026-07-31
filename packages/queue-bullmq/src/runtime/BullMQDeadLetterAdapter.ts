/* eslint-disable @stylistic/max-statements-per-line, @stylistic/lines-between-class-members */
import { createHash } from 'node:crypto'
import type { Job as BullJob, Queue } from 'bullmq'
import { DeadLetterAmbiguousError, DeadLetterInvalidStateError, DeadLetterNotFoundError, DeadLetterOperationConflictError, DeadLetterStaleRevisionError, deadLetterOperationFingerprint, sanitizeDeadLetterError, type DeadLetterAdapter, type DeadLetterDetail, type DeadLetterKey, type DeadLetterListRequest, type DeadLetterMutation, type DeadLetterMutationResult, type DeadLetterOperationReceipt, type DeadLetterOperationStore, type DeadLetterRetry, type DeadLetterSummary } from '@nuxt-laravelize/dead-letter'
import { currentQueueChainStep, readQueueBatchChildEnvelope, readQueueBatchCoordinatorEnvelope, readQueueChainEnvelope } from '@nuxt-laravelize/queue/runtime'

const MAX_PAYLOAD_BYTES = 256 * 1024
const MAX_LIST_JOBS = 1000
const stableJson = (value: unknown): string => {
  const seen = new Set<object>(); let nodes = 0
  const visit = (item: unknown, depth: number): unknown => { if (depth > 32 || ++nodes > 10_000) throw new DeadLetterInvalidStateError(); if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item; if (Array.isArray(item)) return item.map(value => visit(value, depth + 1)); if (typeof item === 'object') { if (seen.has(item)) throw new DeadLetterInvalidStateError(); seen.add(item); const output: Record<string, unknown> = {}; for (const key of Object.keys(item as object).sort()) output[key] = visit((item as Record<string, unknown>)[key], depth + 1); seen.delete(item); return output } throw new DeadLetterInvalidStateError() }
  const json = JSON.stringify(visit(value, 0)); if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) throw new DeadLetterInvalidStateError(); return json
}
const immutableOptions = (job: BullJob) => { const options = job.opts ?? {}; return { attempts: options.attempts ?? null, backoff: options.backoff ?? null, delay: options.delay ?? null, lifo: options.lifo ?? null, priority: options.priority ?? null, removeOnComplete: options.removeOnComplete ?? null, removeOnFail: options.removeOnFail ?? null } }
const fence = (queue: string, job: BullJob) => createHash('sha256').update(stableJson([queue, String(job.id), job.name, job.finishedOn ?? null, job.attemptsMade, job.data, immutableOptions(job), 'failed'])).digest('base64url')
const terminalAt = (job: BullJob) => new Date(job.finishedOn ?? job.processedOn ?? job.timestamp).toISOString()
const inspectablePayload = (data: unknown): unknown => {
  try {
    const chain = readQueueChainEnvelope(data)
    if (chain) return currentQueueChainStep(chain).serialized.payload
    const batch = readQueueBatchChildEnvelope(data)
    if (batch) return batch.serialized.payload
    if (readQueueBatchCoordinatorEnvelope(data)) throw new DeadLetterInvalidStateError()
    if (data && Object.getPrototypeOf(data) === Object.prototype) {
      const value = data as Record<string, unknown>
      if (['kind', 'index', 'steps', 'serialized', 'total', 'fingerprint'].some(key => Object.prototype.hasOwnProperty.call(value, key))) throw new DeadLetterInvalidStateError()
      if ((value.version === 1 || value.version === 2) && typeof value.name === 'string' && value.payload && Object.getPrototypeOf(value.payload) === Object.prototype) return value.payload
    }
    return data
  }
  catch { throw new DeadLetterInvalidStateError() }
}
type ListCursor = { terminalAt: string, id: string }
const parseCursor = (cursor?: string): ListCursor | undefined => {
  if (!cursor) return undefined
  try { const value = JSON.parse(cursor) as Partial<ListCursor>; if (Object.keys(value).sort().join(',') !== 'id,terminalAt' || typeof value.id !== 'string' || value.id.length > 128 || typeof value.terminalAt !== 'string' || new Date(value.terminalAt).toISOString() !== value.terminalAt) throw new Error('Invalid cursor'); return value as ListCursor }
  catch { throw new TypeError('Invalid BullMQ cursor') }
}
const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
const compareJob = (left: BullJob, right: BullJob) => compareText(terminalAt(left), terminalAt(right)) || compareText(String(left.id), String(right.id))
const afterCursor = (job: BullJob, cursor?: ListCursor) => !cursor || terminalAt(job) > cursor.terminalAt || (terminalAt(job) === cursor.terminalAt && String(job.id) > cursor.id)
const throwFailure = (receipt: DeadLetterOperationReceipt): never => { if (receipt.failureCode === 'not_found') throw new DeadLetterNotFoundError(); if (receipt.failureCode === 'stale_revision') throw new DeadLetterStaleRevisionError(); throw new DeadLetterInvalidStateError() }

/** Retry uses durable reservations but BullMQ public APIs cannot make Redis mutation and external receipt commit atomic. Pending outcomes are therefore ambiguous and are never re-executed. */
export class BullMQDeadLetterAdapter implements DeadLetterAdapter {
  readonly source = 'bullmq'
  readonly capabilities = Object.freeze({ retry: true, discard: false, scheduleRetry: false })
  constructor(private readonly queue: Queue, private readonly operations: DeadLetterOperationStore, private readonly clock: () => Date = () => new Date()) { if (!operations) throw new TypeError('BullMQ dead-letter mutations require a DeadLetterOperationStore') }
  async list(request: Omit<DeadLetterListRequest, 'source' | 'cursor'> & { cursor?: string }) {
    if (request.namespace && request.namespace !== this.queue.name) return { items: [] }
    const limit = request.limit ?? 25; const cursor = parseCursor(request.cursor)
    const snapshot = await this.queue.getJobs(['failed'], 0, MAX_LIST_JOBS, true)
    if (snapshot.length > MAX_LIST_JOBS) throw new DeadLetterAmbiguousError('BullMQ dead-letter listing has more than 1000 retained failed jobs; narrow the queue or retention before listing')
    const matching = snapshot.sort(compareJob).filter(job => afterCursor(job, cursor)).map(job => this.summary(job, request.includeErrorSummary)).filter(item => (!request.type || item.type === request.type) && (!request.disposition || request.disposition === 'active'))
    const items = matching.slice(0, limit); const last = items.at(-1)
    return { items, ...(matching.length > items.length && last ? { nextCursor: JSON.stringify({ terminalAt: last.terminalAt, id: last.key.id }) } : {}) }
  }
  async get(key: DeadLetterKey, options?: { includePayload?: boolean, includeErrorSummary?: boolean }): Promise<DeadLetterDetail> { const job = await this.loadFailed(key); const base = this.summary(job, options?.includeErrorSummary); const payload = options?.includePayload ? JSON.parse(stableJson(inspectablePayload(job.data))) : undefined; if (await job.getState() !== 'failed') throw new DeadLetterNotFoundError(); return { ...base, ...(options?.includePayload ? { payload } : {}) } }
  retry(request: DeadLetterRetry) { if (Date.parse(request.availableAt) > this.clock().getTime()) throw new DeadLetterInvalidStateError(); return this.mutate(request) }
  discard(_request: DeadLetterMutation): Promise<DeadLetterMutationResult> { throw new DeadLetterInvalidStateError() }
  private async mutate(request: DeadLetterRetry): Promise<DeadLetterMutationResult> {
    const hash = await deadLetterOperationFingerprint('retry', request); const replay = await this.operations.get(request.operationId)
    if (replay) return this.replayReceipt(replay, hash)
    let job: BullJob
    try { job = await this.loadFailed(request.key) }
    catch (error) {
      if (!(error instanceof DeadLetterNotFoundError)) throw new DeadLetterAmbiguousError()
      const raced = await this.operations.get(request.operationId)
      if (raced) return this.replayReceipt(raced, hash)
      throw error
    }
    assertBatchChildRetryUnsupported(job.data)
    const reservation = await this.operations.reserve(request.operationId, hash); if (reservation === 'exists') { const raced = await this.operations.get(request.operationId); if (!raced) throw new DeadLetterAmbiguousError(); return this.replayReceipt(raced, hash) }
    if (fence(this.queue.name, job) !== request.revision) { await this.operations.finalize(request.operationId, hash, { status: 'failed', failureCode: 'stale_revision' }); throw new DeadLetterStaleRevisionError() }
    try { const current = await this.loadFailed(request.key); if (fence(this.queue.name, current) !== request.revision) { await this.operations.finalize(request.operationId, hash, { status: 'failed', failureCode: 'invalid_state' }); throw new DeadLetterInvalidStateError() }; await current.retry() }
    catch (error) { if (error instanceof DeadLetterInvalidStateError) throw error; throw new DeadLetterAmbiguousError() }
    const result: DeadLetterMutationResult = { key: request.key, disposition: 'active', revision: request.revision, operationId: request.operationId, committedAt: this.clock().toISOString() }
    try { await this.operations.finalize(request.operationId, hash, { status: 'committed', result }) }
    catch { throw new DeadLetterAmbiguousError() }; return result
  }
  private async load(key: DeadLetterKey): Promise<BullJob> { if (key.namespace !== this.queue.name) throw new DeadLetterNotFoundError(); const job = await this.queue.getJob(key.id); if (!job) throw new DeadLetterNotFoundError(); return job }
  private async loadFailed(key: DeadLetterKey): Promise<BullJob> { const job = await this.load(key); if (await job.getState() !== 'failed') throw new DeadLetterNotFoundError(); return job }
  private replayReceipt(receipt: DeadLetterOperationReceipt, hash: string): DeadLetterMutationResult { if (receipt.fingerprint !== hash) throw new DeadLetterOperationConflictError(); if (receipt.status === 'committed' && receipt.result) return receipt.result; if (receipt.status === 'failed') throwFailure(receipt); throw new DeadLetterAmbiguousError() }
  private summary(job: BullJob, includeError = false): DeadLetterSummary { const error = includeError ? sanitizeDeadLetterError(job.failedReason) : undefined; return { key: { source: this.source, namespace: this.queue.name, id: String(job.id) }, type: job.name, disposition: 'active', attempts: job.attemptsMade, terminalAt: terminalAt(job), ...(error ? { error } : {}), revision: fence(this.queue.name, job) } }
}

function assertBatchChildRetryUnsupported(data: unknown): void {
  try {
    if (readQueueBatchChildEnvelope(data) || readQueueBatchCoordinatorEnvelope(data)) throw new DeadLetterInvalidStateError()
  }
  catch { throw new DeadLetterInvalidStateError() }
  if (!data || Object.getPrototypeOf(data) !== Object.prototype) return
  const value = data as Record<string, unknown>
  const kind = typeof value.kind === 'string' ? value.kind : ''
  const childLike = ['id', 'index', 'total', 'serialized', 'fingerprint'].every(key => Object.prototype.hasOwnProperty.call(value, key))
  const coordinatorLike = ['id', 'queue', 'total', 'cancellationRequested', 'fingerprint'].every(key => Object.prototype.hasOwnProperty.call(value, key))
  if (kind.includes('queue-batch') || childLike || coordinatorLike) throw new DeadLetterInvalidStateError()
}

import { DelayedError, Queue as BullQueue, UnrecoverableError, Worker, type Job as BullJob } from 'bullmq'
import { currentQueueChainStep, isJobReleasedError, isNonRetryableJobError, isQueueBatchCancelledError, nextQueueChainEnvelope, NonRetryableJobError, queueBatchChildJobId, queueBatchCoordinatorJobId, queueChainJobId, readQueueBatchChildEnvelope, readQueueBatchCoordinatorEnvelope, readQueueChainEnvelope, type InMemoryJobRegistry, type JobRunner, type QueueBatchChildEnvelopeV1, type QueueChainEnvelopeV1, type SerializedJob } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import type { BullMQConnection } from './BullMQConnection'
import type { FailureReporter } from './FailureReporter'
import { bullMQOptions, matchesBatchJobOptions, matchesQueueQualifiedName, QUEUE_BATCH_COORDINATOR_KIND_NAME } from './BullMQQueue'

export class BullMQWorker {
  readonly #workers = new Set<Worker>()
  readonly #queues = new Map<string, BullQueue>()
  readonly #terminalReports = new Set<Promise<void>>()
  #stopping?: Promise<void>
  constructor(
    private readonly connection: BullMQConnection,
    private readonly registry: InMemoryJobRegistry,
    private readonly runner: JobRunner,
    private readonly failures: FailureReporter = connection.failures,
  ) {}

  async work(queue = 'default', concurrency = 1): Promise<void> {
    if (this.#stopping) throw new Error('BullMQ worker is stopping and cannot accept new queues')
    const worker = new Worker(queue, (job, token) => processBullMQJob(this.runner, job, queue, token, Date.now, chain => this.#advance(chain), batch => this.#batchCancellationRequested(batch, queue)), {
      connection: this.connection.client,
      concurrency,
      ...(this.connection.prefix === undefined ? {} : { prefix: this.connection.prefix }),
    })
    worker.on('failed', (job, error) => {
      const report = this.#reportTerminalFailure(job, error, queue)
      this.#terminalReports.add(report)
      void report.then(() => this.#terminalReports.delete(report), () => this.#terminalReports.delete(report))
    })
    this.#workers.add(worker)
  }

  stop(): Promise<void> {
    this.#stopping ??= this.#drain()
    return this.#stopping
  }

  async #drain(): Promise<void> {
    const workers = [...this.#workers]
    const results = await Promise.allSettled(workers.map(worker => worker.close()))
    for (const worker of workers) this.#workers.delete(worker)
    await Promise.resolve()
    while (this.#terminalReports.size > 0) await Promise.all([...this.#terminalReports])
    const queues = [...this.#queues.values()]
    const queueResults = await Promise.allSettled(queues.map(queue => queue.close()))
    this.#queues.clear()
    const errors = [...results, ...queueResults].flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (errors.length > 0) throw new AggregateError(errors, 'One or more BullMQ workers failed to drain')
  }

  async #reportTerminalFailure(job: BullJob | undefined, error: Error, queue: string): Promise<void> {
    if (!job || !isTerminalBullMQFailure(job, error)) return
    try {
      if (readQueueBatchCoordinatorEnvelope(job.data)) return
    }
    catch {
      return
    }
    let serialized: SerializedJob
    try {
      serialized = executionJob(this.runner, job, queue).serialized
    }
    catch { return }
    try {
      await this.runner.failed(serialized, error, { queue, attempt: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 })
    }
    catch {
      // Preserve the worker's original failure.
    }
    try {
      const freshJob = () => this.registry.rehydrate(this.runner.prepare(serialized))
      await this.failures.report({ job: freshJob(), queue, error, attempts: job.attemptsMade }, freshJob)
    }
    catch {
      // Failure observers must not reject an event-emitter callback.
    }
  }

  async #advance(chain: QueueChainEnvelopeV1): Promise<void> {
    const current = currentQueueChainStep(chain)
    const queued = this.#queues.get(current.options.queue) ?? new BullQueue(current.options.queue, {
      connection: this.connection.client,
      ...(this.connection.prefix === undefined ? {} : { prefix: this.connection.prefix }),
    })
    this.#queues.set(current.options.queue, queued)
    const id = queueChainJobId(chain)
    await queued.add(current.serialized.name, chain, bullMQOptions(current.options, id))
    const persisted = await queued.getJob(id)
    if (!persisted || !matchesBullMQChainJob(persisted, chain)) throw new NonRetryableJobError('QUEUE_CHAIN_HANDOFF_CONFLICT', 'Queue chain successor conflicts with existing broker state.')
  }

  async #batchCancellationRequested(batch: QueueBatchChildEnvelopeV1, queue: string): Promise<boolean> {
    const queued = this.#queues.get(queue) ?? new BullQueue(queue, { connection: this.connection.client, ...(this.connection.prefix === undefined ? {} : { prefix: this.connection.prefix }) })
    this.#queues.set(queue, queued)
    const parent = await queued.getJob(queueBatchCoordinatorJobId(batch.id))
    if (!parent) throw new NonRetryableJobError('INVALID_JOB_BATCH', 'Queue batch coordinator is unavailable.')
    const coordinator = readQueueBatchCoordinatorEnvelope(parent.data)
    if (!coordinator || coordinator.id !== batch.id || coordinator.queue !== queue || coordinator.total !== batch.total || parent.name !== QUEUE_BATCH_COORDINATOR_KIND_NAME || String(parent.id) !== queueBatchCoordinatorJobId(batch.id)) throw new NonRetryableJobError('INVALID_JOB_BATCH', 'Queue batch coordinator is invalid.')
    return coordinator.cancellationRequested
  }
}

export type QueueChainAdvancer = (chain: QueueChainEnvelopeV1) => Promise<void>

export interface BullMQBatchResult { readonly status: 'succeeded' | 'cancelled' }
export type QueueBatchCancellationReader = (batch: QueueBatchChildEnvelopeV1) => Promise<boolean>

export async function processBullMQJob(runner: JobRunner, job: BullJob, queue: string, token?: string, now: () => number = Date.now, advance?: QueueChainAdvancer, cancellationRequested?: QueueBatchCancellationReader): Promise<BullMQBatchResult | undefined> {
  try {
    const coordinator = readQueueBatchCoordinatorEnvelope(job.data)
    if (coordinator) {
      if (job.name !== QUEUE_BATCH_COORDINATOR_KIND_NAME || String(job.id) !== queueBatchCoordinatorJobId(coordinator.id) || coordinator.queue !== queue) throw new NonRetryableJobError('INVALID_JOB_BATCH', 'Queue batch coordinator transport is invalid.')
      return
    }
    const execution = executionJob(runner, job, queue)
    if (execution.batch) {
      if (!cancellationRequested) throw new NonRetryableJobError('INVALID_JOB_BATCH', 'Queue batch cancellation state is unavailable.')
      if (await cancellationRequested(execution.batch)) return { status: 'cancelled' }
    }
    await runner.run(execution.serialized, {
      queue,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
      ...(execution.batch ? { batch: { id: execution.batch.id, queue, isCancellationRequested: () => cancellationRequested!(execution.batch!) } } : {}),
    })
    const next = execution.chain ? nextQueueChainEnvelope(execution.chain) : undefined
    if (next) {
      if (!advance) throw new Error('Queue chain handoff is unavailable')
      await advance(next)
    }
    if (execution.batch) return { status: 'succeeded' }
  }
  catch (error) {
    const batch = safelyReadBatch(job.data)
    if (batch && isQueueBatchCancelledError(error) && cancellationRequested && await cancellationRequested(batch)) return { status: 'cancelled' }
    if (isJobReleasedError(error)) {
      const state = job as BullJob & { attemptsStarted?: number, stalledCounter?: number }
      const attemptsStarted = state.attemptsStarted ?? job.attemptsMade + 1
      const releases = Math.max(0, attemptsStarted - job.attemptsMade - (state.stalledCounter ?? 0) - 1)
      if (releases >= error.maxReleases) throw toBullMQJobError(new NonRetryableJobError('JOB_RELEASE_LIMIT_EXCEEDED', 'Job exceeded its delayed release budget', { cause: error.cause ?? error }))
      await job.moveToDelayed(now() + error.delay, token)
      throw new DelayedError()
    }
    throw toBullMQJobError(error)
  }
}

function executionJob(runner: JobRunner, job: BullJob, queue: string): { readonly serialized: SerializedJob, readonly chain?: QueueChainEnvelopeV1, readonly batch?: QueueBatchChildEnvelopeV1 } {
  let chain: QueueChainEnvelopeV1 | undefined
  const batchLike = Boolean(job.data && typeof job.data === 'object' && Object.prototype.hasOwnProperty.call(job.data, 'kind') && String((job.data as { kind?: unknown }).kind).includes('queue-batch'))
  try {
    chain = readQueueChainEnvelope(job.data)
    if (!chain) {
      const batch = readQueueBatchChildEnvelope(job.data)
      if (!batch) return { serialized: job.data as SerializedJob }
      runner.prepare(batch.serialized)
      if (!matchesBullMQBatchJob(job, batch, queue)) throw new TypeError('Queue batch transport mismatch')
      return { serialized: batch.serialized, batch }
    }
    for (const step of chain.steps) runner.prepare(step.serialized)
    const current = currentQueueChainStep(chain)
    if (current.options.queue !== queue || !matchesBullMQChainJob(job, chain)) throw new TypeError('Queue chain transport mismatch')
    return { serialized: current.serialized, chain }
  }
  catch {
    if (batchLike) throw new NonRetryableJobError('INVALID_JOB_BATCH', 'Queue batch envelope is invalid.')
    throw new NonRetryableJobError('INVALID_JOB_CHAIN', 'Queue chain envelope is invalid.')
  }
}

function safelyReadBatch(value: unknown): QueueBatchChildEnvelopeV1 | undefined {
  try {
    return readQueueBatchChildEnvelope(value)
  }
  catch {
    return undefined
  }
}

function matchesBullMQBatchJob(job: BullJob, batch: QueueBatchChildEnvelopeV1, queue: string): boolean {
  if (!matchesQueueQualifiedName(job.queueQualifiedName, queue)) return false
  const expectedParentKey = `${job.queueQualifiedName}:${queueBatchCoordinatorJobId(batch.id)}`
  return String(job.id) === queueBatchChildJobId(batch.id, batch.index)
    && job.name === batch.serialized.name
    && job.parentKey === expectedParentKey
    && matchesBatchJobOptions(job.opts, batch.options)
    && queue.length <= 256
}

function matchesBullMQChainJob(job: BullJob, chain: QueueChainEnvelopeV1): boolean {
  try {
    const persisted = readQueueChainEnvelope(job.data)
    const current = currentQueueChainStep(chain)
    return persisted?.fingerprint === chain.fingerprint
      && String(job.id) === queueChainJobId(chain)
      && job.name === current.serialized.name
      && matchesBullMQOptions(job, current.options)
  }
  catch { return false }
}

function matchesBullMQOptions(job: BullJob, options: { readonly tries: number, readonly delay: number, readonly priority: number, readonly backoff: number | readonly number[] }): boolean {
  const backoff = job.opts.backoff
  const backoffDelay = typeof backoff === 'number' ? backoff : backoff?.delay ?? 0
  const expectedBackoff = typeof options.backoff === 'number' ? options.backoff : options.backoff[0] ?? 0
  return (job.opts.attempts ?? 1) === options.tries
    && (job.opts.delay ?? 0) === options.delay
    && (job.opts.priority ?? 0) === options.priority
    && backoffDelay === expectedBackoff
    && (typeof backoff !== 'object' || backoff.type === 'fixed')
}

export function toBullMQJobError(error: unknown): unknown {
  if (!isNonRetryableJobError(error)) return error
  const converted = new UnrecoverableError(`[${error.code}] Non-retryable job failure`)
  if (error instanceof Error && error.cause !== undefined) Object.defineProperty(converted, 'cause', { configurable: true, value: error.cause })
  return converted
}

export function isTerminalBullMQFailure(job: Pick<BullJob, 'attemptsMade' | 'opts'>, error: Error): boolean {
  return error.name !== 'DelayedError' && (error instanceof UnrecoverableError || error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1))
}

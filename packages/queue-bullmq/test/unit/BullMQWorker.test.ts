import { DelayedError, UnrecoverableError, type Job as BullJob } from 'bullmq'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { currentQueueChainStep, InMemoryJobRegistry, Job, JobReleasedError, JobRunner, JobSerializer, nextQueueChainEnvelope, NonRetryableJobError, prepareQueueChain, queueChainJobId, type QueueChainEnvelopeV1 } from '@nuxt-laravelize/queue/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BullMQWorker, isTerminalBullMQFailure, processBullMQJob, toBullMQJobError } from '../../src/runtime/BullMQWorker'
import { FailureReporter } from '../../src/runtime/FailureReporter'

const bullWorkers = vi.hoisted(() => ({ instances: [] as Array<{
  close: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
  options: Record<string, unknown>
  process: (job: BullJob, token?: string) => Promise<void>
}> }))
const bullQueues = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(async () => {}),
  getJob: vi.fn(),
}))

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>()
  return {
    ...actual,
    Queue: class {
      readonly add = bullQueues.add
      readonly close = bullQueues.close
      readonly getJob = bullQueues.getJob
    },
    Worker: class {
      readonly close = vi.fn(async () => {})
      readonly #listeners = new Map<string, Array<(...args: unknown[]) => void>>()
      constructor(_queue: string, readonly process: (job: BullJob, token?: string) => Promise<void>, readonly options: Record<string, unknown>) { bullWorkers.instances.push(this) }
      on(event: string, listener: (...args: unknown[]) => void) {
        const listeners = this.#listeners.get(event) ?? []
        listeners.push(listener)
        this.#listeners.set(event, listeners)
        return this
      }

      emit(event: string, ...args: unknown[]): void {
        for (const listener of this.#listeners.get(event) ?? []) listener(...args)
      }
    },
  }
})

class ProbeJob extends Job {
  static runs: number[] = []
  readonly payload: Record<string, unknown>
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload
  }

  handle(): void { ProbeJob.runs.push(Number(this.payload.value ?? 0)) }
}

describe('toBullMQJobError', () => {
  it('maps portable terminal errors to BullMQ unrecoverable errors without leaking details', () => {
    const mapped = toBullMQJobError(new NonRetryableJobError('TENANT_MISMATCH', 'tenant secret-value'))
    expect(mapped).toBeInstanceOf(UnrecoverableError)
    expect((mapped as Error).message).toBe('[TENANT_MISMATCH] Non-retryable job failure')
  })

  it('preserves retryable errors', () => {
    const error = new Error('temporary')
    expect(toBullMQJobError(error)).toBe(error)
  })

  it('maps runner terminal failures during processing without consuming retries', async () => {
    const runner = { run: vi.fn().mockRejectedValue(new NonRetryableJobError('QUEUE_AUTHORIZATION_DENIED', 'private authorization detail')) } as unknown as JobRunner
    const job = { data: { version: 1, name: 'Probe', payload: {} }, attemptsMade: 0, opts: { attempts: 5 } }

    const error = await processBullMQJob(runner, job as never, 'critical').catch(value => value)

    expect(error).toBeInstanceOf(UnrecoverableError)
    expect(error.message).toBe('[QUEUE_AUTHORIZATION_DENIED] Non-retryable job failure')
    expect(error.message).not.toContain('private')
  })

  it('does not classify delayed releases as terminal failures', () => {
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 1 } }, { name: 'DelayedError' } as Error)).toBe(false)
  })

  it('moves portable releases to delayed without mapping them as failures', async () => {
    const runner = { run: vi.fn().mockRejectedValue(new JobReleasedError(2500)) } as unknown as JobRunner
    const job = { data: { version: 1, name: 'Probe', payload: {} }, attemptsMade: 0, opts: { attempts: 3 }, moveToDelayed: vi.fn().mockResolvedValue(undefined) }

    await expect(processBullMQJob(runner, job as never, 'critical', 'worker-token', () => 1000)).rejects.toBeInstanceOf(DelayedError)

    expect(job.moveToDelayed).toHaveBeenCalledWith(3500, 'worker-token')
    expect(runner.run).toHaveBeenCalledWith(job.data, { queue: 'critical', attempt: 1, maxAttempts: 3 })
  })

  it('preserves move-to-delayed failures and enforces release budgets', async () => {
    const moveError = new Error('stale worker lock')
    const releaseCause = new Error('throttle open')
    const runner = { run: vi.fn().mockRejectedValue(new JobReleasedError(100, 1, { cause: releaseCause })) } as unknown as JobRunner
    const moving = { data: { version: 1, name: 'Probe', payload: {} }, attemptsMade: 0, attemptsStarted: 1, opts: { attempts: 3 }, moveToDelayed: vi.fn().mockRejectedValue(moveError) }
    await expect(processBullMQJob(runner, moving as never, 'critical', 'token')).rejects.toBe(moveError)

    const exhausted = { ...moving, attemptsStarted: 2, moveToDelayed: vi.fn() }
    const failure = await processBullMQJob(runner, exhausted as never, 'critical', 'token').catch(error => error)
    expect(failure).toBeInstanceOf(UnrecoverableError)
    expect(failure.cause).toBe(releaseCause)
    expect(exhausted.moveToDelayed).not.toHaveBeenCalled()

    const stalled = { ...moving, attemptsStarted: 2, stalledCounter: 1, moveToDelayed: vi.fn().mockResolvedValue(undefined) }
    await expect(processBullMQJob(runner, stalled as never, 'critical', 'token')).rejects.toBeInstanceOf(DelayedError)
    expect(stalled.moveToDelayed).toHaveBeenCalledOnce()
  })

  it('advances a validated chain only after the current step succeeds', async () => {
    ProbeJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    const chain = prepareQueueChain([
      { job: new ProbeJob({ value: 1 }), options: { queue: 'critical' } },
      { job: new ProbeJob({ value: 2 }), options: { queue: 'reports' } },
    ], new JobSerializer(), (job, _queue, serializer) => serializer.serialize(job), () => 'test-chain')
    const advance = vi.fn().mockResolvedValue(undefined)

    await processBullMQJob(runner, chainJob(chain), 'critical', undefined, Date.now, advance)

    expect(ProbeJob.runs).toEqual([1])
    expect(advance).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-chain', index: 1 }))
  })

  it('rejects a chain with a tampered future step before current effects', async () => {
    ProbeJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    const chain = prepareQueueChain([
      { job: new ProbeJob({ value: 1 }), options: { queue: 'critical' } },
      { job: new ProbeJob({ value: 2 }), options: { queue: 'reports' } },
    ], new JobSerializer(), (job, _queue, serializer) => serializer.serialize(job), () => 'test-chain')
    ;(chain.steps[1]!.serialized.payload as { value: number }).value = 99
    const advance = vi.fn()

    const failure = await processBullMQJob(runner, chainJob(chain), 'critical', undefined, Date.now, advance).catch(error => error)

    expect(failure).toBeInstanceOf(UnrecoverableError)
    expect(failure.message).toBe('[INVALID_JOB_CHAIN] Non-retryable job failure')
    expect(ProbeJob.runs).toEqual([])
    expect(advance).not.toHaveBeenCalled()
  })

  it('does not advance a chain when current execution fails', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    runner.use('fail-current', async () => {
      throw new Error('temporary')
    })
    const chain = prepareQueueChain([
      { job: new ProbeJob({ value: 1 }), options: { queue: 'critical' } },
      { job: new ProbeJob({ value: 2 }), options: { queue: 'reports' } },
    ], new JobSerializer(), (job, _queue, serializer) => serializer.serialize(job), () => 'test-chain')
    const advance = vi.fn()

    await expect(processBullMQJob(runner, chainJob(chain), 'critical', undefined, Date.now, advance)).rejects.toThrow('temporary')
    expect(advance).not.toHaveBeenCalled()
  })

  it('rejects chain transport metadata that does not match the current step', async () => {
    ProbeJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    const chain = prepareQueueChain([
      { job: new ProbeJob({ value: 1 }), options: { queue: 'critical', tries: 2 } },
    ], new JobSerializer(), (job, _queue, serializer) => serializer.serialize(job), () => 'test-chain')
    const job = { ...chainJob(chain), id: 'injected-id' }

    const failure = await processBullMQJob(runner, job as never, 'critical').catch(error => error)

    expect(failure).toBeInstanceOf(UnrecoverableError)
    expect(failure.message).toBe('[INVALID_JOB_CHAIN] Non-retryable job failure')
    expect(ProbeJob.runs).toEqual([])
  })

  it('treats an unrecoverable first attempt as terminal for failure reporting', () => {
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new UnrecoverableError('terminal'))).toBe(true)
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new Error('temporary'))).toBe(false)
  })
})

describe('BullMQWorker lifecycle', () => {
  beforeEach(() => {
    bullWorkers.instances.splice(0)
    bullQueues.add.mockReset()
    bullQueues.close.mockReset().mockResolvedValue(undefined)
    bullQueues.getJob.mockReset()
  })

  it('rejects a handoff when the persisted deterministic successor conflicts', async () => {
    ProbeJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const runner = new JobRunner(createContainer(), registry)
    const worker = new BullMQWorker({ client: {} } as never, registry, runner)
    const chain = prepareQueueChain([
      { job: new ProbeJob({ value: 1 }), options: { queue: 'critical' } },
      { job: new ProbeJob({ value: 2 }), options: { queue: 'reports' } },
    ], new JobSerializer(), (job, _queue, serializer) => serializer.serialize(job), () => 'test-chain')
    const next = nextQueueChainEnvelope(chain)!
    bullQueues.add.mockResolvedValue(chainJob(next))
    bullQueues.getJob.mockResolvedValue({ ...chainJob(next), data: { version: 1, name: ProbeJob.name, payload: {} } })
    await worker.work('critical')

    const failure = await bullWorkers.instances[0]!.process(chainJob(chain)).catch(error => error)

    expect(failure).toBeInstanceOf(UnrecoverableError)
    expect(failure.message).toBe('[QUEUE_CHAIN_HANDOFF_CONFLICT] Non-retryable job failure')
    expect(bullQueues.getJob).toHaveBeenCalledWith(queueChainJobId(next))
    expect(ProbeJob.runs).toEqual([1])
    await worker.stop()
  })

  it('shares one idempotent drain and rejects work after stopping begins', async () => {
    const worker = createWorker()
    await worker.work('first')
    const close = deferred()
    bullWorkers.instances[0]!.close.mockReturnValue(close.promise)

    const first = worker.stop()
    const duplicate = worker.stop()

    expect(duplicate).toBe(first)
    expect(bullWorkers.instances[0]!.close).toHaveBeenCalledOnce()
    await expect(worker.work('late')).rejects.toThrow('is stopping')
    expect(bullWorkers.instances).toHaveLength(1)
    close.resolve()
    await first
  })

  it('drains every registered worker and attempts all closes when one fails', async () => {
    const worker = createWorker()
    await worker.work('first')
    await worker.work('second')
    const firstError = new Error('first close failed')
    const secondError = new Error('second close failed')
    bullWorkers.instances[0]!.close.mockRejectedValue(firstError)
    bullWorkers.instances[1]!.close.mockRejectedValue(secondError)

    const failure = await worker.stop().catch(error => error)

    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([firstError, secondError])
    expect(bullWorkers.instances[0]!.close).toHaveBeenCalledOnce()
    expect(bullWorkers.instances[1]!.close).toHaveBeenCalledOnce()
  })

  it('waits for terminal failure hooks and observers before finishing drain', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const hook = deferred()
    const runner = new JobRunner(createContainer(), registry)
    vi.spyOn(runner, 'failed').mockImplementation(() => hook.promise)
    const failures = new FailureReporter()
    const observed: Job[] = []
    failures.listen(({ job }) => {
      const payload = job.payload as Record<string, unknown>
      payload.mutated = true
    })
    failures.listen(({ job }) => {
      observed.push(job)
    })
    const worker = new BullMQWorker({ client: {} } as never, registry, runner, failures)
    await worker.work('critical')
    bullWorkers.instances[0]!.close.mockImplementation(async () => {
      bullWorkers.instances[0]!.emit('failed', {
        data: new ProbeJob({}).serialize(),
        attemptsMade: 1,
        opts: { attempts: 1 },
      }, new Error('terminal'))
    })

    let stopped = false
    const stopping = worker.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    expect(runner.failed).toHaveBeenCalledOnce()

    hook.resolve()
    await stopping
    expect(observed).toHaveLength(1)
    expect(observed[0]?.payload).toEqual({})
  })

  it('does not expose tampered payloads to terminal failure observers', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(ProbeJob.name, ProbeJob)
    const failures = new FailureReporter()
    const observed = vi.fn()
    failures.listen(observed)
    const worker = new BullMQWorker({ client: {} } as never, registry, new JobRunner(createContainer(), registry), failures)
    const serialized = new JobSerializer().serialize(new ProbeJob({}))
    await worker.work('critical')

    bullWorkers.instances[0]!.emit('failed', {
      data: { ...serialized, payload: { tampered: true } },
      attemptsMade: 1,
      opts: { attempts: 1 },
    }, new UnrecoverableError('[INVALID_JOB_DISPATCH] Non-retryable job failure'))
    await worker.stop()

    expect(observed).not.toHaveBeenCalled()
  })

  it('stops safely before any queue is registered', async () => {
    const worker = createWorker()
    await expect(worker.stop()).resolves.toBeUndefined()
    await expect(worker.work()).rejects.toThrow('is stopping')
  })

  it('forwards the connection prefix to every worker', async () => {
    const worker = new BullMQWorker(
      { client: {}, prefix: 'orders:production' } as never,
      new InMemoryJobRegistry(),
      { run: vi.fn(), failed: vi.fn() } as unknown as JobRunner,
    )

    await worker.work('critical', 3)

    expect(bullWorkers.instances[0]!.options).toMatchObject({ connection: {}, concurrency: 3, prefix: 'orders:production' })
    await worker.stop()
  })
})

function createWorker(): BullMQWorker {
  return new BullMQWorker(
    { client: {} } as never,
    new InMemoryJobRegistry(),
    { run: vi.fn(), failed: vi.fn() } as unknown as JobRunner,
  )
}

function chainJob(chain: QueueChainEnvelopeV1) {
  const current = currentQueueChainStep(chain)
  const backoff = typeof current.options.backoff === 'number' ? current.options.backoff : current.options.backoff[0] ?? 0
  return {
    id: queueChainJobId(chain),
    name: current.serialized.name,
    data: chain,
    attemptsMade: 0,
    opts: { attempts: current.options.tries, delay: current.options.delay, priority: current.options.priority, backoff: { type: 'fixed', delay: backoff } },
  } as unknown as BullJob
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

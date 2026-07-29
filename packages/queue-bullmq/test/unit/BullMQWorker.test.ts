import { DelayedError, UnrecoverableError } from 'bullmq'
import { InMemoryJobRegistry, Job, JobReleasedError, NonRetryableJobError, type JobRunner } from '@nuxt-laravelize/queue/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BullMQWorker, isTerminalBullMQFailure, processBullMQJob, toBullMQJobError } from '../../src/runtime/BullMQWorker'
import { FailureReporter } from '../../src/runtime/FailureReporter'

const bullWorkers = vi.hoisted(() => ({ instances: [] as Array<{
  close: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
  options: Record<string, unknown>
}> }))

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>()
  return {
    ...actual,
    Worker: class {
      readonly close = vi.fn(async () => {})
      readonly #listeners = new Map<string, Array<(...args: unknown[]) => void>>()
      constructor(_queue: string, _processor: unknown, readonly options: Record<string, unknown>) { bullWorkers.instances.push(this) }
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
  readonly payload = {}
  constructor(_payload: Record<string, unknown>) { super() }
  handle(): void {}
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

  it('treats an unrecoverable first attempt as terminal for failure reporting', () => {
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new UnrecoverableError('terminal'))).toBe(true)
    expect(isTerminalBullMQFailure({ attemptsMade: 1, opts: { attempts: 5 } }, new Error('temporary'))).toBe(false)
  })
})

describe('BullMQWorker lifecycle', () => {
  beforeEach(() => bullWorkers.instances.splice(0))

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
    const runner = { run: vi.fn(), failed: vi.fn(() => hook.promise) } as unknown as JobRunner
    const failures = new FailureReporter()
    const observed = vi.fn()
    failures.listen(observed)
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
    expect(observed).toHaveBeenCalledOnce()
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

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

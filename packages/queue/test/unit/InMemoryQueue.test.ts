import { describe, expect, it, vi } from 'vitest'
import { createContainer, type Resolver } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, InMemoryQueue, Job, JobRegistrationCollisionError, JobReleasedError, JobRunner, NonRetryableJobError } from '../../src/runtime/index'

class TestJob extends Job<{ value: number }> {
  static runs: number[] = []
  readonly payload: { value: number }
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { value: number }
  }

  async handle(_resolver: Resolver): Promise<void> { TestJob.runs.push(this.payload.value) }
}
class FailedJob extends Job {
  readonly payload = {}
  static didFail = false
  constructor(_payload: Record<string, unknown>) { super() }
  handle() {}
  override failed() { FailedJob.didFail = true }
}
class StableJob extends TestJob {
  static override readonly jobName = 'stable.test.v1'
}
class PriorityJob extends TestJob {
  static override readonly priority = 1
}
class TerminalJob extends Job {
  static runs = 0
  static failures = 0
  readonly payload = {}
  constructor(_payload: Record<string, unknown>) { super() }
  handle(): never {
    TerminalJob.runs += 1
    throw new NonRetryableJobError('INVALID_PAYLOAD', 'invalid')
  }

  override failed(): void { TerminalJob.failures += 1 }
}

describe('InMemoryQueue', () => {
  it('registers explicit, constructor and stable names while rejecting collisions', () => {
    const registry = new InMemoryJobRegistry()
    registry.register('supplied-name', StableJob)
    expect(registry.rehydrate({ version: 1, name: 'supplied-name', payload: { value: 1 } })).toBeInstanceOf(StableJob)
    expect(registry.rehydrate({ version: 1, name: StableJob.name, payload: { value: 1 } })).toBeInstanceOf(StableJob)
    expect(registry.rehydrate({ version: 1, name: StableJob.jobName, payload: { value: 1 } })).toBeInstanceOf(StableJob)
    expect(() => registry.register('supplied-name', TestJob)).toThrow(JobRegistrationCollisionError)
  })
  it('executes registered jobs in a disposable job scope', async () => {
    const container = createContainer()
    const scope = container.createScope()
    const dispose = vi.spyOn(scope, 'dispose')
    vi.spyOn(container, 'createScope').mockReturnValue(scope)
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(container, registry))

    await queue.sync(new TestJob({ value: 7 }))

    expect(TestJob.runs).toContain(7)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('clears delayed jobs and their timers', async () => {
    vi.useFakeTimers()
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))
    await queue.later(100, new TestJob({ value: 99 }))
    await queue.clear()
    await vi.advanceTimersByTimeAsync(100)
    expect(await queue.size()).toBe(0)
    expect(TestJob.runs).not.toContain(99)
    vi.useRealTimers()
  })

  it('orders ready jobs by BullMQ-compatible priority and preserves FIFO ties', async () => {
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    registry.register(PriorityJob.name, PriorityJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    await Promise.all([
      queue.push(new TestJob({ value: 20 }), { priority: 20 }),
      queue.push(new PriorityJob({ value: 1 })),
      queue.push(new TestJob({ value: 0 })),
      queue.push(new PriorityJob({ value: 2 }), { priority: 1 }),
    ])
    await vi.waitFor(() => expect(TestJob.runs).toHaveLength(4))

    expect(TestJob.runs).toEqual([0, 1, 2, 20])
  })

  it('does not make delayed high-priority jobs eligible before their delay', async () => {
    vi.useFakeTimers()
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    try {
      await queue.push(new TestJob({ value: 1 }), { delay: 100, priority: 0 })
      await queue.push(new TestJob({ value: 2 }), { priority: 10 })
      await vi.advanceTimersByTimeAsync(0)
      expect(TestJob.runs).toEqual([2])
      await vi.advanceTimersByTimeAsync(100)
      expect(TestJob.runs).toEqual([2, 1])
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('keeps retry backoff ineligible when another job schedules the queue', async () => {
    vi.useFakeTimers()
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const runner = new JobRunner(createContainer(), registry)
    let attempts = 0
    runner.use('fail-once', async (job, _scope, next) => {
      if (job.payload.value === 31 && attempts++ === 0) throw new Error('retry')
      await next()
    })
    const queue = new InMemoryQueue(runner)

    try {
      await queue.push(new TestJob({ value: 31 }), { tries: 2, backoff: 100, priority: 1 })
      await vi.advanceTimersByTimeAsync(0)
      await queue.push(new TestJob({ value: 32 }), { priority: 2 })
      await vi.advanceTimersByTimeAsync(0)
      expect(TestJob.runs).toEqual([32])
      expect(attempts).toBe(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(TestJob.runs).toEqual([32, 31])
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('keeps middleware releases ineligible when another job schedules the queue', async () => {
    vi.useFakeTimers()
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const runner = new JobRunner(createContainer(), registry)
    let releases = 0
    runner.use('release-once', async (job, _scope, next) => {
      if (job.payload.value === 41 && releases++ === 0) throw new JobReleasedError(100)
      await next()
    })
    const queue = new InMemoryQueue(runner)

    try {
      await queue.push(new TestJob({ value: 41 }), { priority: 1 })
      await vi.advanceTimersByTimeAsync(0)
      await queue.push(new TestJob({ value: 42 }), { priority: 2 })
      await vi.advanceTimersByTimeAsync(0)
      expect(TestJob.runs).toEqual([42])
      expect(releases).toBe(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(TestJob.runs).toEqual([42, 41])
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('rejects priorities outside the portable BullMQ range', async () => {
    const queue = new InMemoryQueue(new JobRunner(createContainer(), new InMemoryJobRegistry()))
    await expect(queue.push(new TestJob({ value: 1 }), { priority: -1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
    await expect(queue.push(new TestJob({ value: 1 }), { priority: 2 ** 21 + 1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
  })

  it('creates, contributes, and disposes a scope for terminal failed hooks', async () => {
    const container = createContainer()
    const scope = container.createScope()
    const dispose = vi.spyOn(scope, 'dispose')
    vi.spyOn(container, 'createScope').mockReturnValue(scope)
    const registry = new InMemoryJobRegistry()
    registry.register(FailedJob.name, FailedJob)
    const runner = new JobRunner(container, registry)
    const contribute = vi.fn()
    runner.contributeScope(contribute)
    await runner.failed(new FailedJob({}).serialize(), new Error('terminal'))
    expect(FailedJob.didFail).toBe(true)
    expect(contribute).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('does not retry a non-retryable failure', async () => {
    TerminalJob.runs = 0
    TerminalJob.failures = 0
    const registry = new InMemoryJobRegistry()
    registry.register(TerminalJob.name, TerminalJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    await queue.push(new TerminalJob({}), { tries: 5 })
    await vi.waitFor(() => expect(TerminalJob.failures).toBe(1))

    expect(TerminalJob.runs).toBe(1)
  })

  it('releases without consuming attempts or invoking failure observers', async () => {
    vi.useFakeTimers()
    let releases = 2
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const runner = new JobRunner(createContainer(), registry)
    const attempts: number[] = []
    runner.use('release-twice', async (_job, _scope, next, descriptor) => {
      attempts.push(descriptor?.attempt ?? 0)
      if (releases-- > 0) throw new JobReleasedError(100)
      await next()
    })
    const queue = new InMemoryQueue(runner)
    const failed = vi.fn()
    queue.onFailed(failed)

    try {
      await queue.push(new TestJob({ value: 101 }), { tries: 1 })
      await vi.advanceTimersByTimeAsync(0)
      expect(TestJob.runs).not.toContain(101)
      await vi.advanceTimersByTimeAsync(200)
      expect(TestJob.runs).toContain(101)
      expect(attempts).toEqual([1, 1, 1])
      expect(failed).not.toHaveBeenCalled()
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('fails terminally after exhausting the independent release budget', async () => {
    vi.useFakeTimers()
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const runner = new JobRunner(createContainer(), registry)
    runner.use('always-release', async () => {
      throw new JobReleasedError(10, 1)
    })
    const queue = new InMemoryQueue(runner)
    const failed = vi.fn()
    queue.onFailed(failed)

    try {
      await queue.push(new TestJob({ value: 102 }), { tries: 5 })
      await vi.advanceTimersByTimeAsync(10)
      await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce())
      expect(failed.mock.calls[0]?.[0]).toMatchObject({ attempts: 1, error: { code: 'JOB_RELEASE_LIMIT_EXCEEDED' } })
      expect(TestJob.runs).not.toContain(102)
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })
})

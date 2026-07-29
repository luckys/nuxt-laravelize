import { describe, expect, it, vi } from 'vitest'
import { createContainer, type Resolver } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, InMemoryQueue, Job, JobRegistrationCollisionError, JobReleasedError, JobRunner, NonRetryableJobError, readJobTags } from '../../src/runtime/index'

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
class TaggedJob extends TestJob {
  constructor(payload: Record<string, unknown>, private readonly values: readonly string[] = []) { super(payload) }
  override tags() { return this.values }
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

  it('does not treat an empty queue name as every queue', async () => {
    vi.useFakeTimers()
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    try {
      await queue.push(new TestJob({ value: 97 }), { queue: '', delay: 1_000 })
      await queue.push(new TestJob({ value: 98 }), { queue: 'reports', delay: 1_000 })

      await expect(queue.size('')).resolves.toBe(1)
      await queue.clear('')
      await expect(queue.size('')).resolves.toBe(0)
      await expect(queue.size('reports')).resolves.toBe(1)
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
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

  it('reuses the admitted tag snapshot across delayed releases', async () => {
    vi.useFakeTimers()
    const registry = new InMemoryJobRegistry()
    registry.register(TaggedJob.name, TaggedJob)
    const runner = new JobRunner(createContainer(), registry)
    const seen: (readonly string[])[] = []
    let release = true
    runner.use('tag-snapshot', async (job, _scope, next) => {
      seen.push(readJobTags(job))
      if (release) {
        release = false
        throw new JobReleasedError(100)
      }
      await next()
    })
    const queue = new InMemoryQueue(runner)
    const tags = ['report:original']

    try {
      const admission = queue.push(new TaggedJob({ value: 43 }, tags))
      tags[0] = 'report:mutated'
      await admission
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(100)
      expect(seen).toEqual([['report:original'], ['report:original']])
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

  it('atomically suppresses duplicate admission until the original job terminates', async () => {
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    const [first, duplicate] = await Promise.all([
      queue.push(new TestJob({ value: 61 }), { deduplication: { id: 'report-61' } }),
      queue.push(new TestJob({ value: 62 }), { deduplication: { id: 'report-61' } }),
    ])
    await vi.waitFor(() => expect(TestJob.runs).toEqual([61]))
    await new Promise(resolve => setTimeout(resolve, 0))
    const afterCompletion = await queue.push(new TestJob({ value: 63 }), { deduplication: { id: 'report-61' } })
    await vi.waitFor(() => expect(TestJob.runs).toEqual([61, 63]))

    expect(duplicate).toEqual(first)
    expect(afterCompletion.id).not.toBe(first.id)
  })

  it('expires ttl deduplication independently from delayed job completion', async () => {
    vi.useFakeTimers()
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    try {
      const first = await queue.push(new TestJob({ value: 71 }), { delay: 1_000, deduplication: { id: 'report-71', ttl: 100 } })
      await vi.advanceTimersByTimeAsync(99)
      const duplicate = await queue.push(new TestJob({ value: 72 }), { deduplication: { id: 'report-71', ttl: 100 } })
      await vi.advanceTimersByTimeAsync(1)
      const afterExpiry = await queue.push(new TestJob({ value: 73 }), { deduplication: { id: 'report-71', ttl: 100 } })
      await vi.advanceTimersByTimeAsync(0)

      expect(duplicate).toEqual(first)
      expect(afterExpiry.id).not.toBe(first.id)
      expect(TestJob.runs).toEqual([73])
      await vi.advanceTimersByTimeAsync(900)
      expect(TestJob.runs).toEqual([73, 71])
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('keeps deduplication reservations across retry backoff', async () => {
    vi.useFakeTimers()
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const runner = new JobRunner(createContainer(), registry)
    let attempts = 0
    runner.use('deduplicated-retry', async (_job, _scope, next) => {
      if (attempts++ === 0) throw new Error('retry')
      await next()
    })
    const queue = new InMemoryQueue(runner)

    try {
      const first = await queue.push(new TestJob({ value: 81 }), { tries: 2, backoff: 100, deduplication: { id: 'report-81' } })
      await vi.advanceTimersByTimeAsync(0)
      const duplicate = await queue.push(new TestJob({ value: 82 }), { deduplication: { id: 'report-81' } })
      expect(duplicate).toEqual(first)
      await vi.advanceTimersByTimeAsync(100)
      expect(TestJob.runs).toEqual([81])
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('keeps deduplication reservations across middleware releases', async () => {
    vi.useFakeTimers()
    TestJob.runs = []
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const runner = new JobRunner(createContainer(), registry)
    let release = true
    runner.use('deduplicated-release', async (_job, _scope, next) => {
      if (release) {
        release = false
        throw new JobReleasedError(100)
      }
      await next()
    })
    const queue = new InMemoryQueue(runner)

    try {
      const first = await queue.push(new TestJob({ value: 91 }), { deduplication: { id: 'report-91' } })
      await vi.advanceTimersByTimeAsync(0)
      const duplicate = await queue.push(new TestJob({ value: 92 }), { deduplication: { id: 'report-91' } })
      expect(duplicate).toEqual(first)
      await vi.advanceTimersByTimeAsync(100)
      expect(TestJob.runs).toEqual([91])
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('releases terminal deduplication before failure observers enqueue replacements', async () => {
    TestJob.runs = []
    TerminalJob.runs = 0
    TerminalJob.failures = 0
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    registry.register(TerminalJob.name, TerminalJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))
    let replacement: Awaited<ReturnType<typeof queue.push>> | undefined
    queue.onFailed(async () => {
      replacement = await queue.push(new TestJob({ value: 93 }), { deduplication: { id: 'report-93' } })
    })

    const failed = await queue.push(new TerminalJob({}), { deduplication: { id: 'report-93' } })
    await vi.waitFor(() => expect(TestJob.runs).toEqual([93]))

    expect(replacement?.id).not.toBe(failed.id)
    expect(TerminalJob.failures).toBe(1)
  })

  it('actively sweeps expired ttl reservations with one bounded timer', async () => {
    vi.useFakeTimers()
    const registry = new InMemoryJobRegistry()
    registry.register(TestJob.name, TestJob)
    const queue = new InMemoryQueue(new JobRunner(createContainer(), registry))

    try {
      await Promise.all(Array.from({ length: 50 }, (_, index) => queue.push(new TestJob({ value: index }), {
        deduplication: { id: `report-${index}`, ttl: 100 },
      })))
      expect(vi.getTimerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })

  it('validates bounded deduplication metadata before admission', async () => {
    const queue = new InMemoryQueue(new JobRunner(createContainer(), new InMemoryJobRegistry()))
    await expect(queue.push(new TestJob({ value: 1 }), { deduplication: { id: '' } })).rejects.toThrow('deduplication id must be a safe identifier')
    await expect(queue.push(new TestJob({ value: 1 }), { deduplication: { id: 'valid', ttl: 0 } })).rejects.toThrow('deduplication ttl must be an integer between 1 and 86400000')
    await expect(queue.push(new TestJob({ value: 1 }), { deduplication: { id: 'valid', replace: true } as never })).rejects.toThrow('deduplication must contain only id and optional ttl')
    await expect(queue.push(new TestJob({ value: 1 }), { id: 'job-1', deduplication: { id: 'valid' } })).rejects.toThrow('id and deduplication cannot be combined')
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
    const releaseCause = new Error('throttle open')
    runner.use('always-release', async () => {
      throw new JobReleasedError(10, 1, { cause: releaseCause })
    })
    const queue = new InMemoryQueue(runner)
    const failed = vi.fn()
    queue.onFailed(failed)

    try {
      await queue.push(new TestJob({ value: 102 }), { tries: 5 })
      await vi.advanceTimersByTimeAsync(10)
      await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce())
      expect(failed.mock.calls[0]?.[0]).toMatchObject({ attempts: 1, error: { code: 'JOB_RELEASE_LIMIT_EXCEEDED' } })
      expect(failed.mock.calls[0]?.[0].error.cause).toBe(releaseCause)
      expect(TestJob.runs).not.toContain(102)
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })
})

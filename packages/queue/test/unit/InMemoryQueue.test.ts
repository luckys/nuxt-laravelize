import { describe, expect, it, vi } from 'vitest'
import { createContainer, type Resolver } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry, InMemoryQueue, Job, JobRegistrationCollisionError, JobRunner, NonRetryableJobError } from '../../src/runtime/index'

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
})

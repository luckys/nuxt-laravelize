import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerInstances: Array<{
  name: string
  handler: (job: { data: { name: string, args: readonly unknown[] } }) => Promise<unknown>
  options: { connection: unknown, concurrency: number }
  close: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
}> = []

vi.mock('bullmq', () => {
  return {
    Worker: vi.fn().mockImplementation(function (name: string, handler: never, options: never) {
      const instance = {
        name,
        handler: handler as (job: { data: { name: string, args: readonly unknown[] } }) => Promise<unknown>,
        options: options as { connection: unknown, concurrency: number },
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      }
      workerInstances.push(instance)
      return instance
    }),
  }
})

// eslint-disable-next-line import/first
import type { Resolver } from '../../src/core/container/Container'
// eslint-disable-next-line import/first
import { BullMQConnection } from '../../src/queue/BullMQConnection'
// eslint-disable-next-line import/first
import { InMemoryJobRegistry } from '../../src/queue/InMemoryJobRegistry'
// eslint-disable-next-line import/first
import { Job } from '../../src/queue/Job'
// eslint-disable-next-line import/first
import { QueueWorker } from '../../src/queue/QueueWorker'

class RecordingJob extends Job {
  static handled: string[] = []
  constructor(public readonly tag: string) { super() }

  handle() {
    RecordingJob.handled.push(this.tag)
  }

  serialize() { return { name: 'RecordingJob', args: [this.tag] } }
}

const fakeResolver: Resolver = {
  make<T>(): T { return ({} as unknown) as T },
  has() { return true },
}

function buildConnection(): BullMQConnection {
  return new BullMQConnection({ __ioredis: true })
}

beforeEach(() => {
  workerInstances.length = 0
  RecordingJob.handled = []
})

describe('QueueWorker', () => {
  it('work(queueName) starts a BullMQ Worker with the right connection + concurrency', async () => {
    const registry = new InMemoryJobRegistry()
    registry.registerJob('RecordingJob', RecordingJob)
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)

    await worker.work('default', 3)

    expect(workerInstances).toHaveLength(1)
    expect(workerInstances[0]?.name).toBe('default')
    expect(workerInstances[0]?.options.connection).toEqual({ __ioredis: true })
    expect(workerInstances[0]?.options.concurrency).toBe(3)
  })

  it('default concurrency is 1', async () => {
    const registry = new InMemoryJobRegistry()
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)
    await worker.work('default')
    expect(workerInstances[0]?.options.concurrency).toBe(1)
  })

  it('worker handler rehydrates via registry and invokes handle', async () => {
    const registry = new InMemoryJobRegistry()
    registry.registerJob('RecordingJob', RecordingJob)
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)
    await worker.work()

    await workerInstances[0]?.handler({ data: { name: 'RecordingJob', args: ['hi'] } })

    expect(RecordingJob.handled).toEqual(['hi'])
  })

  it('handler errors propagate (BullMQ marks failed)', async () => {
    class FailingJob extends Job {
      handle() { throw new Error('fail') }
      serialize() { return { name: 'FailingJob', args: [] } }
    }
    const registry = new InMemoryJobRegistry()
    registry.registerJob('FailingJob', FailingJob)
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)
    await worker.work()

    await expect(workerInstances[0]?.handler({ data: { name: 'FailingJob', args: [] } })).rejects.toThrow('fail')
  })

  it('handler rehydration error propagates (unknown job name)', async () => {
    const registry = new InMemoryJobRegistry()
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)
    await worker.work()

    await expect(workerInstances[0]?.handler({ data: { name: 'NoSuch', args: [] } })).rejects.toMatchObject({
      name: 'JobNotRegisteredError',
    })
  })

  it('subscribes a "failed" handler that logs the error', async () => {
    const registry = new InMemoryJobRegistry()
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)
    await worker.work()

    const failedHandlerEntry = workerInstances[0]?.on.mock.calls.find(call => call[0] === 'failed')
    expect(failedHandlerEntry).toBeDefined()
    const failedHandler = failedHandlerEntry?.[1] as ((job: { id: string } | undefined, error: Error) => void)
    expect(typeof failedHandler).toBe('function')

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    failedHandler({ id: 'job-42' }, new Error('boom'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('job-42'), expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('stop() closes all active workers', async () => {
    const registry = new InMemoryJobRegistry()
    const worker = new QueueWorker(buildConnection(), registry, fakeResolver)
    await worker.work('default')
    await worker.work('priority')

    await worker.stop()

    expect(workerInstances[0]?.close).toHaveBeenCalled()
    expect(workerInstances[1]?.close).toHaveBeenCalled()
  })

  it('ListenerJob is rehydrated and given resolver + registry', async () => {
    const calls: string[] = []
    class FakeListener {
      handle(event: { x: string }) { calls.push(event.x) }
    }
    class FakeEvent {
      constructor(public readonly x: string) {}
    }

    const resolver: Resolver = {
      make<T>(token: { key: string }): T {
        if (token.key === 'listener-key') return (new FakeListener() as unknown) as T
        throw new Error(`unknown ${token.key}`)
      },
      has() { return true },
    }
    const registry = new InMemoryJobRegistry()
    registry.registerEvent('FakeEvent', FakeEvent as never)

    const { ListenerJob } = await import('../../src/queue/ListenerJob')
    registry.registerJob('laravelize.ListenerJob', ListenerJob)

    const worker = new QueueWorker(buildConnection(), registry, resolver)
    await worker.work()

    await workerInstances[0]?.handler({
      data: {
        name: 'laravelize.ListenerJob',
        args: [{ listenerTokenKey: 'listener-key', eventConstructorName: 'FakeEvent', eventArgs: ['hello'] }],
      },
    })

    expect(calls).toEqual(['hello'])
  })
})

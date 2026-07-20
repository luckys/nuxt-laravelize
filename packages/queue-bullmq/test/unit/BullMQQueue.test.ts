import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job, JobSerializer, type JobRunner } from '@nuxt-laravelize/queue/runtime'
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'

const add = vi.fn(async (_name: string, _data: unknown, _options: unknown) => ({ id: 'bull-1' }))
vi.mock('bullmq', () => ({ Queue: class { add = add; count = vi.fn(); obliterate = vi.fn(); close = vi.fn() } }))

class ProbeJob extends Job {
  readonly payload = { value: 1 }
  handle() {}
}

describe('BullMQQueue', () => {
  beforeEach(() => add.mockClear())

  it('pushes metadata from the required shared serializer', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const serializer = new JobSerializer()
    serializer.contribute(() => ({ propagated: 'context' }))
    const connection = { client: {} } as never
    const runner = { run: vi.fn() } as unknown as JobRunner
    await new BullMQQueue(connection, runner, serializer).push(new ProbeJob())
    expect(add).toHaveBeenCalledWith('ProbeJob', {
      version: 2,
      name: 'ProbeJob',
      payload: { value: 1 },
      metadata: { propagated: 'context' },
    }, expect.any(Object))
  })

  it('preserves producer construction while forwarding a scoped serializer resolver', async () => {
    const token = createToken<string>('bullmq.test-context')
    const scope = createContainer().createScope()
    scope.override(token, 'request-context')
    const serializer = new JobSerializer(undefined, scope)
    serializer.contribute((_job, resolver) => ({ propagated: resolver?.make(token) }))
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    await new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, serializer).push(new ProbeJob())
    expect(add.mock.calls[0]?.[1]).toMatchObject({ metadata: { propagated: 'request-context' } })
  })

  it('rejects job ids that BullMQ cannot persist', async () => {
    const { BullMQQueue } = await import('../../src/runtime/BullMQQueue')
    const queue = new BullMQQueue({ client: {} } as never, { run: vi.fn() } as unknown as JobRunner, new JobSerializer())
    await expect(queue.push(new ProbeJob(), { id: 'outbox:message' })).rejects.toThrow(/must not contain a colon/)
    expect(add).not.toHaveBeenCalled()
  })
})

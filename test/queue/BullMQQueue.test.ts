import { beforeEach, describe, expect, it, vi } from 'vitest'

const addMock = vi.fn()
const countMock = vi.fn().mockResolvedValue(0)
const drainMock = vi.fn().mockResolvedValue(undefined)
const obliterateMock = vi.fn().mockResolvedValue(undefined)

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn().mockImplementation(function (name: string) {
      return {
        name,
        add: (...args: unknown[]) => addMock(...args),
        count: () => countMock(),
        drain: () => drainMock(),
        obliterate: (opts: unknown) => obliterateMock(opts),
      }
    }),
  }
})

// eslint-disable-next-line import/first
import { Job } from '../../src/queue/Job'
// eslint-disable-next-line import/first
import { BullMQQueue } from '../../src/queue/BullMQQueue'
// eslint-disable-next-line import/first
import { BullMQConnection } from '../../src/queue/BullMQConnection'

class FooJob extends Job {
  static override readonly tries = 4
  static override readonly delay = 100
  static override readonly queue = 'priority'
  static override readonly backoff = 500
  constructor(public readonly v: string) { super() }
  handle() {}
  serialize() { return { name: 'FooJob', args: [this.v] } }
}

class DefaultJob extends Job {
  handle() {}
  serialize() { return { name: 'DefaultJob', args: [] } }
}

function buildConnection(): BullMQConnection {
  return new BullMQConnection({ __ioredis: true })
}

beforeEach(async () => {
  addMock.mockReset()
  addMock.mockResolvedValue({ id: 'bull-id-1' })
  countMock.mockClear()
  countMock.mockResolvedValue(0)
  drainMock.mockClear()
  obliterateMock.mockClear()
  const { Queue: QueueCtor } = await import('bullmq')
  ;(QueueCtor as unknown as ReturnType<typeof vi.fn>).mockClear()
})

describe('BullMQQueue', () => {
  it('push calls bullmq.Queue.add with serialized payload + mapped options', async () => {
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new FooJob('hello'))

    expect(addMock).toHaveBeenCalledTimes(1)
    const [name, data, opts] = addMock.mock.calls[0] ?? []
    expect(name).toBe('FooJob')
    expect(data).toEqual({ name: 'FooJob', args: ['hello'] })
    expect(opts).toMatchObject({
      attempts: 4,
      delay: 100,
      backoff: { type: 'fixed', delay: 500 },
    })
  })

  it('push options override Job statics', async () => {
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new FooJob('hi'), { tries: 10, delay: 0, backoff: 1000, queue: 'override' })

    const [, , opts] = addMock.mock.calls[0] ?? []
    expect(opts).toMatchObject({
      attempts: 10,
      delay: 0,
      backoff: { type: 'fixed', delay: 1000 },
    })
  })

  it('later(delay) adds delay to opts', async () => {
    const queue = new BullMQQueue(buildConnection())
    await queue.later(250, new DefaultJob())

    const [, , opts] = addMock.mock.calls[0] ?? []
    expect(opts?.delay).toBe(250)
  })

  it('size(name) calls count() on the named queue', async () => {
    countMock.mockResolvedValueOnce(7)
    const queue = new BullMQQueue(buildConnection())
    const n = await queue.size('foo')
    expect(n).toBe(7)
    expect(countMock).toHaveBeenCalled()
  })

  it('size() with no name sums all initialized queues', async () => {
    countMock.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new DefaultJob())
    await queue.push(new FooJob('x'))
    const total = await queue.size()
    expect(total).toBe(5)
  })

  it('clear(name) drains + obliterates that queue', async () => {
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new DefaultJob())
    await queue.clear('default')

    expect(drainMock).toHaveBeenCalled()
    expect(obliterateMock).toHaveBeenCalledWith({ force: true })
  })

  it('clear() with no name drains + obliterates all initialized queues', async () => {
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new DefaultJob())
    await queue.push(new FooJob('x'))
    await queue.clear()

    expect(drainMock).toHaveBeenCalledTimes(2)
    expect(obliterateMock).toHaveBeenCalledTimes(2)
  })

  it('reuses the same Queue instance for the same queue name (lazy init)', async () => {
    const { Queue: QueueCtor } = await import('bullmq')
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new DefaultJob())
    await queue.push(new DefaultJob())

    expect(QueueCtor).toHaveBeenCalledTimes(1)
  })

  it('creates separate Queue instances for different queue names', async () => {
    const { Queue: QueueCtor } = await import('bullmq')
    const queue = new BullMQQueue(buildConnection())
    await queue.push(new DefaultJob())
    await queue.push(new FooJob('x'))

    expect(QueueCtor).toHaveBeenCalledTimes(2)
  })

  it('push resolves with JobHandle.id from the BullMQ job id', async () => {
    addMock.mockResolvedValueOnce({ id: 'bull-id-42' })
    const queue = new BullMQQueue(buildConnection())
    const handle = await queue.push(new DefaultJob())
    expect(handle.id).toBe('bull-id-42')
    expect(handle.queue).toBe('default')
  })
})

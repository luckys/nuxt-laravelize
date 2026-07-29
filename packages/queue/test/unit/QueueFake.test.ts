import { describe, expect, it, vi } from 'vitest'
import { Job } from '../../src/runtime'
import { QueueFake } from '../../src/runtime/testing'

class PriorityJob extends Job {
  static override readonly priority = 12
  readonly payload = {}
  handle() {}
}

class ReportsJob extends Job {
  static override readonly queue = 'reports'
  readonly payload = {}
  handle() {}
}

describe('QueueFake priority', () => {
  it('records the effective static priority and push override', async () => {
    const queue = new QueueFake()

    await queue.push(new PriorityJob())
    await queue.push(new PriorityJob(), { priority: 3 })

    expect(queue.pushed.map(item => item.priority)).toEqual([12, 3])
  })

  it('rejects priority values rejected by real drivers', async () => {
    const queue = new QueueFake()

    await expect(queue.push(new PriorityJob(), { priority: -1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
    await expect(queue.push(new PriorityJob(), { priority: 2 ** 21 + 1 })).rejects.toThrow('priority must be an integer between 0 and 2097152')
    expect(queue.pushed).toHaveLength(0)
  })
})

describe('QueueFake deduplication', () => {
  it('suppresses matching queue-local pushes and returns the original handle', async () => {
    const queue = new QueueFake()

    const first = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-1' } })
    const duplicate = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-1' } })
    const otherQueue = await queue.push(new PriorityJob(), { queue: 'exports', deduplication: { id: 'report-1' } })

    expect(duplicate).toEqual(first)
    expect(otherQueue).not.toEqual(first)
    expect(queue.pushed).toHaveLength(2)
  })

  it('admits pushes after ttl expiry or explicit clear', async () => {
    vi.useFakeTimers()
    const queue = new QueueFake()

    try {
      const first = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-2', ttl: 100 } })
      await vi.advanceTimersByTimeAsync(100)
      const afterExpiry = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-2', ttl: 100 } })
      await queue.clear('reports')
      const afterClear = await queue.push(new PriorityJob(), { queue: 'reports', deduplication: { id: 'report-2' } })

      expect(afterExpiry.id).not.toBe(first.id)
      expect(afterClear.id).not.toBe(afterExpiry.id)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('rejects unsupported or unbounded deduplication metadata', async () => {
    const queue = new QueueFake()
    await expect(queue.push(new PriorityJob(), { deduplication: { id: 'unsafe id' } })).rejects.toThrow('deduplication id must be a safe identifier')
    await expect(queue.push(new PriorityJob(), { deduplication: { id: 'safe', ttl: 86_400_001 } })).rejects.toThrow('deduplication ttl must be an integer between 1 and 86400000')
    await expect(queue.push(new PriorityJob(), { id: 'job-1', deduplication: { id: 'safe' } })).rejects.toThrow('id and deduplication cannot be combined')
    expect(queue.pushed).toHaveLength(0)
  })

  it('actively sweeps ttl reservations with one timer', async () => {
    vi.useFakeTimers()
    const queue = new QueueFake()

    try {
      await Promise.all(Array.from({ length: 50 }, (_, index) => queue.push(new PriorityJob(), {
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
})

describe('QueueFake recording', () => {
  it('keeps generated handles unique across full and selective clears', async () => {
    const queue = new QueueFake()
    const first = await queue.push(new PriorityJob(), { queue: 'exports' })
    const second = await queue.push(new ReportsJob())

    await queue.clear('reports')
    const afterSelectiveClear = await queue.push(new ReportsJob())
    await queue.clear()
    const afterFullClear = await queue.push(new PriorityJob(), { queue: 'exports' })

    expect([first.id, second.id, afterSelectiveClear.id, afterFullClear.id]).toEqual(['fake-1', 'fake-2', 'fake-3', 'fake-4'])
  })

  it('counts and clears the effective static queue', async () => {
    const queue = new QueueFake()
    await queue.push(new ReportsJob())
    await queue.push(new PriorityJob(), { queue: 'exports' })

    await expect(queue.size('reports')).resolves.toBe(1)
    await queue.clear('reports')
    expect(queue.pushed.map(item => item.queue)).toEqual(['exports'])
  })

  it('does not treat an empty queue name as every queue', async () => {
    const queue = new QueueFake()
    await queue.push(new PriorityJob(), { queue: '' })
    await queue.push(new ReportsJob())

    await expect(queue.size('')).resolves.toBe(1)
    await queue.clear('')
    expect(queue.pushed.map(item => item.queue)).toEqual(['reports'])
  })
})

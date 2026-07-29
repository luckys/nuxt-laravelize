import { describe, expect, it } from 'vitest'
import { Job } from '../../src/runtime'
import { QueueFake } from '../../src/runtime/testing'

class PriorityJob extends Job {
  static override readonly priority = 12
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

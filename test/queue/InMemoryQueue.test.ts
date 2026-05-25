import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Job } from '../../src/queue/Job'
import { InMemoryQueue } from '../../src/queue/InMemoryQueue'

let counter: { value: number, runs: string[] }

class RecordingJob extends Job {
  constructor(public readonly tag: string) { super() }

  handle() {
    counter.runs.push(this.tag)
    counter.value += 1
  }

  serialize() { return { name: 'RecordingJob', args: [this.tag] } }
}

class CustomQueueJob extends Job {
  static override readonly queue = 'priority'

  constructor(public readonly tag: string) { super() }

  handle() { counter.runs.push(this.tag) }

  serialize() { return { name: 'CustomQueueJob', args: [this.tag] } }
}

class RetryableJob extends Job {
  static override readonly tries = 3

  #failures: number

  constructor(failures: number, public readonly tag: string) {
    super()
    this.#failures = failures
  }

  handle() {
    if (this.#failures > 0) {
      this.#failures -= 1
      throw new Error('transient')
    }
    counter.runs.push(this.tag)
  }

  serialize() { return { name: 'RetryableJob', args: [this.#failures, this.tag] } }
}

class AlwaysFailJob extends Job {
  static override readonly tries = 2

  constructor(public readonly tag: string) { super() }

  handle() { throw new Error(`always-fail:${this.tag}`) }

  serialize() { return { name: 'AlwaysFailJob', args: [this.tag] } }
}

beforeEach(() => {
  counter = { value: 0, runs: [] }
})

afterEach(() => {
  vi.useRealTimers()
})

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>(resolve => queueMicrotask(resolve))
  await new Promise<void>(resolve => queueMicrotask(resolve))
}

describe('InMemoryQueue', () => {
  it('push resolves with a JobHandle that has id and queue', async () => {
    const queue = new InMemoryQueue()
    const handle = await queue.push(new RecordingJob('a'))

    expect(handle.id).toMatch(/.+/)
    expect(handle.queue).toBe('default')
  })

  it('job executes after a microtask flush', async () => {
    const queue = new InMemoryQueue()
    await queue.push(new RecordingJob('a'))

    expect(counter.runs).toEqual([])
    await flushMicrotasks()
    expect(counter.runs).toEqual(['a'])
  })

  it('push does not block the caller', async () => {
    const queue = new InMemoryQueue()
    const before = counter.runs.length
    await queue.push(new RecordingJob('a'))
    expect(counter.runs.length).toBe(before)
  })

  it('later(delay) defers job execution by delay ms', async () => {
    vi.useFakeTimers()
    const queue = new InMemoryQueue()
    await queue.later(50, new RecordingJob('a'))

    await flushMicrotasks()
    expect(counter.runs).toEqual([])

    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    expect(counter.runs).toEqual(['a'])
  })

  it('size() counts pending across queues', async () => {
    const queue = new InMemoryQueue()
    expect(await queue.size()).toBe(0)

    await queue.later(10000, new RecordingJob('a'))
    await queue.later(10000, new CustomQueueJob('b'))

    expect(await queue.size()).toBe(2)
  })

  it('size(name) counts pending in a specific queue only', async () => {
    const queue = new InMemoryQueue()
    await queue.later(10000, new RecordingJob('a'))
    await queue.later(10000, new CustomQueueJob('b'))

    expect(await queue.size('default')).toBe(1)
    expect(await queue.size('priority')).toBe(1)
  })

  it('clear() drops pending across queues', async () => {
    const queue = new InMemoryQueue()
    await queue.later(10000, new RecordingJob('a'))
    await queue.later(10000, new CustomQueueJob('b'))

    await queue.clear()
    expect(await queue.size()).toBe(0)
  })

  it('clear(name) drops pending in a specific queue only', async () => {
    const queue = new InMemoryQueue()
    await queue.later(10000, new RecordingJob('a'))
    await queue.later(10000, new CustomQueueJob('b'))

    await queue.clear('default')
    expect(await queue.size('default')).toBe(0)
    expect(await queue.size('priority')).toBe(1)
  })

  it('async handle is awaited', async () => {
    class AsyncJob extends Job {
      async handle() {
        await Promise.resolve()
        counter.runs.push('async')
      }

      serialize() { return { name: 'AsyncJob', args: [] } }
    }

    const queue = new InMemoryQueue()
    await queue.push(new AsyncJob())
    await flushMicrotasks()
    expect(counter.runs).toEqual(['async'])
  })

  it('FIFO order within the same queue', async () => {
    const queue = new InMemoryQueue()
    await queue.push(new RecordingJob('a'))
    await queue.push(new RecordingJob('b'))
    await queue.push(new RecordingJob('c'))

    await flushMicrotasks()
    expect(counter.runs).toEqual(['a', 'b', 'c'])
  })

  it('different queues run independently', async () => {
    const queue = new InMemoryQueue()
    await queue.push(new RecordingJob('default-a'))
    await queue.push(new CustomQueueJob('priority-a'))

    await flushMicrotasks()
    expect(counter.runs).toContain('default-a')
    expect(counter.runs).toContain('priority-a')
  })

  it('job retries when it throws (up to tries)', async () => {
    const queue = new InMemoryQueue()
    await queue.push(new RetryableJob(2, 'a'))

    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()
    expect(counter.runs).toEqual(['a'])
  })

  it('job that exceeds tries logs and stops', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const queue = new InMemoryQueue()
    await queue.push(new AlwaysFailJob('x'))

    await flushMicrotasks()
    await flushMicrotasks()
    await flushMicrotasks()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[laravelize.queue] job failed',
      expect.objectContaining({ message: 'always-fail:x' }),
    )
    consoleSpy.mockRestore()
  })

  it('push options override Job statics', async () => {
    const queue = new InMemoryQueue()
    await queue.push(new RecordingJob('a'), { queue: 'override' })

    expect(await queue.size('override')).toBe(0)
  })

  it('later does not run before its delay elapses (asserted via size)', async () => {
    vi.useFakeTimers()
    const queue = new InMemoryQueue()
    await queue.later(100, new RecordingJob('a'))

    expect(await queue.size()).toBe(1)
    vi.advanceTimersByTime(50)
    expect(await queue.size()).toBe(1)
    vi.advanceTimersByTime(50)
    await flushMicrotasks()
    expect(counter.runs).toEqual(['a'])
  })

  it('handle receives no arguments when invoked by InMemoryQueue', async () => {
    let receivedArgs: unknown[] | null = null
    class ArgInspectJob extends Job {
      handle(...args: unknown[]) {
        receivedArgs = args
      }

      serialize() { return { name: 'ArgInspectJob', args: [] } }
    }

    const queue = new InMemoryQueue()
    await queue.push(new ArgInspectJob())
    await flushMicrotasks()
    expect(receivedArgs).toEqual([])
  })
})

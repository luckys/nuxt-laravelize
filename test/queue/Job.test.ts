import { describe, expect, it } from 'vitest'

import { Job } from '../../src/queue/Job'

class FooJob extends Job {
  constructor(public readonly value: string) { super() }
  handle() {}
  serialize() { return { name: 'FooJob', args: [this.value] } }
}

class CustomJob extends Job {
  static override readonly tries = 5
  static override readonly delay = 2000
  static override readonly queue = 'priority'
  static override readonly backoff = 1000
  handle() {}
  serialize() { return { name: 'CustomJob', args: [] } }
}

describe('Job', () => {
  it('exposes default statics tries=1, delay=0, queue="default", backoff=0', () => {
    expect(Job.tries).toBe(1)
    expect(Job.delay).toBe(0)
    expect(Job.queue).toBe('default')
    expect(Job.backoff).toBe(0)
  })

  it('subclass inherits defaults when not overridden', () => {
    expect(FooJob.tries).toBe(1)
    expect(FooJob.queue).toBe('default')
  })

  it('subclass overrides statics', () => {
    expect(CustomJob.tries).toBe(5)
    expect(CustomJob.delay).toBe(2000)
    expect(CustomJob.queue).toBe('priority')
    expect(CustomJob.backoff).toBe(1000)
  })

  it('serialize() returns shape with name + args', () => {
    const job = new FooJob('hello')
    expect(job.serialize()).toEqual({ name: 'FooJob', args: ['hello'] })
  })
})

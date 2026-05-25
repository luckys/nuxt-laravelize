import { describe, expect, it } from 'vitest'

import { Job } from '../../src/queue/Job'
import { EventNotRegisteredError, JobNotRegisteredError } from '../../src/queue/errors'
import { InMemoryJobRegistry } from '../../src/queue/InMemoryJobRegistry'

class FooJob extends Job {
  constructor(public readonly v: string) { super() }
  handle() {}
  serialize() { return { name: 'FooJob', args: [this.v] } }
}

class BarEvent {
  constructor(public readonly x: number) {}
}

describe('InMemoryJobRegistry', () => {
  it('registerJob + rehydrateJob round-trip', () => {
    const reg = new InMemoryJobRegistry()
    reg.registerJob('FooJob', FooJob)

    const instance = reg.rehydrateJob({ name: 'FooJob', args: ['hello'] })
    expect(instance).toBeInstanceOf(FooJob)
    expect((instance as FooJob).v).toBe('hello')
  })

  it('registerEvent + getEvent round-trip', () => {
    const reg = new InMemoryJobRegistry()
    reg.registerEvent('BarEvent', BarEvent)

    const ctor = reg.getEvent('BarEvent')
    const inst = new ctor(42)
    expect(inst).toBeInstanceOf(BarEvent)
    expect((inst as BarEvent).x).toBe(42)
  })

  it('rehydrateJob throws JobNotRegisteredError for unknown name', () => {
    const reg = new InMemoryJobRegistry()
    expect(() => reg.rehydrateJob({ name: 'NotThere', args: [] })).toThrow(JobNotRegisteredError)
  })

  it('getEvent throws EventNotRegisteredError for unknown name', () => {
    const reg = new InMemoryJobRegistry()
    expect(() => reg.getEvent('NotThere')).toThrow(EventNotRegisteredError)
  })

  it('re-registering a job name overwrites (last-write-wins)', () => {
    class FooJobV2 extends Job {
      constructor(public readonly v: string) { super() }
      handle() {}
      serialize() { return { name: 'FooJob', args: [this.v] } }
    }

    const reg = new InMemoryJobRegistry()
    reg.registerJob('FooJob', FooJob)
    reg.registerJob('FooJob', FooJobV2)

    expect(reg.rehydrateJob({ name: 'FooJob', args: ['hi'] })).toBeInstanceOf(FooJobV2)
  })

  it('re-registering an event name overwrites', () => {
    class BarEventV2 {
      constructor(public readonly x: number) {}
    }

    const reg = new InMemoryJobRegistry()
    reg.registerEvent('BarEvent', BarEvent)
    reg.registerEvent('BarEvent', BarEventV2)

    expect(reg.getEvent('BarEvent')).toBe(BarEventV2)
  })
})

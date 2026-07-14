import { describe, expect, it } from 'vitest'
import { createContainer, createToken } from '@nuxt-laravelize/core/runtime'
import type { Listener } from '@nuxt-laravelize/events/runtime'
import { InMemoryJobRegistry, InMemoryQueue, JobRunner } from '@nuxt-laravelize/queue/runtime'
import { EventRegistry } from '../../src/runtime/EventRegistry'
import { QueueListenerAdapter } from '../../src/runtime/QueueListenerAdapter'
import { eventRegistryToken } from '../../src/runtime/tokens'

class Event {
  constructor(readonly value: string) {}
  toPayload(): readonly unknown[] { return [this.value] }
}

describe('QueueListenerAdapter', () => {
  it('reconstructs and invokes a listener through queue without package cycles', async () => {
    const handled: string[] = []
    const listenerToken = createToken<Listener<Event>>('listener')
    const container = createContainer()
    const events = new EventRegistry()
    container.instance(eventRegistryToken, events)
    container.instance(listenerToken, {
      handle: (event) => {
        handled.push(event.value)
      },
    })
    container.seal()
    const jobs = new InMemoryJobRegistry()
    const queue = new InMemoryQueue(new JobRunner(container, jobs))
    const adapter = new QueueListenerAdapter(queue, jobs, events)

    expect(await adapter.enqueue(listenerToken as never, new Event('done'))).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(handled).toEqual(['done'])
  })
})

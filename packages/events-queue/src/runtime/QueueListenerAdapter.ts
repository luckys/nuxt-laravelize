import type { Token } from '@nuxt-laravelize/core/runtime'
import type { Listener, QueuedListenerAdapter } from '@nuxt-laravelize/events/runtime'
import type { InMemoryJobRegistry, Queue } from '@nuxt-laravelize/queue/runtime'

import type { EventRegistry, SerializableEventConstructor } from './EventRegistry'
import { ListenerJob } from './ListenerJob'

interface SerializableEvent {
  toPayload(): readonly unknown[]
}

export class QueueListenerAdapter implements QueuedListenerAdapter {
  constructor(
    private readonly queue: Queue,
    private readonly jobs: InMemoryJobRegistry,
    private readonly events: EventRegistry,
  ) {
    jobs.register(ListenerJob.name, ListenerJob)
  }

  async enqueue(listener: Token<Listener<unknown>>, event: unknown): Promise<boolean> {
    if (!isSerializableEvent(event)) return false
    const constructor = (event as object).constructor as SerializableEventConstructor
    this.events.register(constructor.name, constructor)
    await this.queue.push(new ListenerJob({
      listenerTokenKey: listener.key,
      eventName: constructor.name,
      eventArgs: event.toPayload(),
    }))
    return true
  }
}

function isSerializableEvent(event: unknown): event is SerializableEvent & object {
  return typeof event === 'object' && event !== null && typeof (event as Partial<SerializableEvent>).toPayload === 'function'
}

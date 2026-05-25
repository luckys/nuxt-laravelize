import type { Resolver } from '../core/container/Container'
import type { Token } from '../core/container/Token'
import type { EventConstructor as JobEventConstructor, JobRegistry } from '../queue/JobRegistry'
import { jobRegistryToken } from '../queue/JobRegistryToken'
import { ListenerJob } from '../queue/ListenerJob'
import type { Queue } from '../queue/Queue'
import { queueToken } from '../queue/QueueToken'

import type { Dispatcher, EventConstructor } from './Dispatcher'
import type { EventSubscriber } from './EventSubscriber'
import type { Listener } from './Listener'

interface BoundEntry {
  token: Token<Listener<unknown>>
}

interface EventWithPayload {
  toPayload?: () => readonly unknown[]
}

export class InMemoryDispatcher implements Dispatcher {
  readonly #resolver: Resolver
  readonly #bound = new Map<EventConstructor, BoundEntry[]>()
  readonly #anyListeners: BoundEntry[] = []

  constructor(resolver: Resolver) {
    this.#resolver = resolver
  }

  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void {
    const ctor = event as EventConstructor
    const current = this.#bound.get(ctor) ?? []
    current.push({ token: listener as unknown as Token<Listener<unknown>> })
    this.#bound.set(ctor, current)
  }

  listenAny(listener: Token<Listener<unknown>>): void {
    this.#anyListeners.push({ token: listener })
  }

  subscribe(subscriber: Token<EventSubscriber>): void {
    const instance = this.#resolver.make(subscriber)
    instance.subscribe(this)
  }

  async dispatch<E>(event: E): Promise<void> {
    const ctor = (event as object).constructor as EventConstructor
    const bound = this.#bound.get(ctor) ?? []
    const listeners = [...bound, ...this.#anyListeners]

    for (const entry of listeners) {
      const listener = this.#resolver.make(entry.token)
      const isQueued = (listener.constructor as { shouldQueue?: true }).shouldQueue === true
      if (isQueued) {
        if (this.#tryPushToQueue(entry.token, ctor, event)) continue
        this.#scheduleMicrotask(listener, event)
        continue
      }
      await listener.handle(event)
    }
  }

  #tryPushToQueue(token: Token<Listener<unknown>>, ctor: EventConstructor, event: unknown): boolean {
    if (!this.#resolver.has(queueToken)) return false

    const eventWithPayload = event as EventWithPayload
    if (typeof eventWithPayload.toPayload !== 'function') {
      console.warn(`[laravelize.events] event "${ctor.name}" lacks toPayload(); skipping queue push`)
      return false
    }

    const queue = this.#resolver.make<Queue>(queueToken)
    const registry = this.#resolver.make<JobRegistry>(jobRegistryToken)
    registry.registerEvent(ctor.name, ctor as unknown as JobEventConstructor)

    const job = new ListenerJob({
      listenerTokenKey: token.key,
      eventConstructorName: ctor.name,
      eventArgs: eventWithPayload.toPayload(),
    })

    void queue.push(job).catch((error) => {
      console.error('[laravelize.events] queue push failed', error)
    })

    return true
  }

  #scheduleMicrotask(listener: Listener<unknown>, event: unknown): void {
    const captured = listener
    void Promise.resolve().then(() => {
      queueMicrotask(() => {
        try {
          const result = captured.handle(event)
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error('[laravelize.events] queued listener failed', error)
            })
          }
        }
        catch (error) {
          console.error('[laravelize.events] queued listener failed', error)
        }
      })
    })
  }
}

import type { Resolver, Token } from '@nuxt-laravelize/core/runtime'

import type { Dispatcher, EventConstructor, EventSubscriber, Listener, QueuedListenerAdapter, ShouldQueue } from './contracts'
import { queuedListenerAdapterToken } from './tokens'

interface BoundListener {
  readonly token: Token<Listener<unknown>>
}

export class InMemoryDispatcher implements Dispatcher {
  readonly #listeners = new Map<EventConstructor, BoundListener[]>()
  readonly #anyListeners: BoundListener[] = []

  constructor(private readonly resolver: Resolver) {}

  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void {
    const type = event as EventConstructor
    const listeners = this.#listeners.get(type) ?? []
    listeners.push({ token: listener as Token<Listener<unknown>> })
    this.#listeners.set(type, listeners)
  }

  listenAny(listener: Token<Listener<unknown>>): void {
    this.#anyListeners.push({ token: listener })
  }

  subscribe(subscriber: Token<EventSubscriber>): void {
    this.resolver.make(subscriber).subscribe(this)
  }

  async dispatch<E>(event: E): Promise<void> {
    const eventType = (event as object).constructor as EventConstructor
    const listeners = [...(this.#listeners.get(eventType) ?? []), ...this.#anyListeners]

    for (const entry of listeners) {
      const listener = this.resolver.make(entry.token)
      if (await this.#enqueueWhenSupported(entry.token, listener, event)) continue
      if (await listener.handle(event) === false) break
    }
  }

  async #enqueueWhenSupported(token: Token<Listener<unknown>>, listener: Listener<unknown>, event: unknown): Promise<boolean> {
    if (!isQueuedListener(listener) || !this.resolver.has(queuedListenerAdapterToken)) return false
    return this.resolver.make<QueuedListenerAdapter>(queuedListenerAdapterToken).enqueue(token, event)
  }
}

function isQueuedListener(listener: Listener<unknown>): boolean {
  const instanceMarker = (listener as Listener<unknown> & Partial<ShouldQueue>).shouldQueue === true
  const classMarker = (listener.constructor as { shouldQueue?: boolean }).shouldQueue === true
  return instanceMarker || classMarker
}

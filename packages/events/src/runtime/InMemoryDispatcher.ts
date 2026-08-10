import type { Resolver, Token } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { Dispatcher, EventConstructor, EventSubscriber, Listener, QueuedListenerAdapter, ShouldQueue } from './contracts'
import { EventListenerRegistry } from './EventListenerRegistry'
import { queuedListenerAdapterToken } from './tokens'

export class InMemoryDispatcher implements Dispatcher {
  readonly #listeners = new EventListenerRegistry()

  constructor(
    private readonly resolver: Resolver,
    private readonly sharedListeners?: EventListenerRegistry,
  ) {}

  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void {
    this.#listeners.listen(event, listener)
  }

  listenAny(listener: Token<Listener<unknown>>): void {
    this.#listeners.listenAny(listener)
  }

  subscribe(subscriber: Token<EventSubscriber>): void {
    this.resolver.make(subscriber).subscribe(this)
  }

  async dispatch<E>(event: E): Promise<void> {
    const eventType = (event as object).constructor as EventConstructor
    const listeners = [
      ...(this.sharedListeners?.listenersFor(eventType) ?? []),
      ...this.#listeners.listenersFor(eventType),
      ...(this.sharedListeners?.anyListeners() ?? []),
      ...this.#listeners.anyListeners(),
    ]

    for (const token of listeners) {
      const listener = this.resolver.make(token)
      if (await this.#enqueueWhenSupported(token, listener, event)) continue
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

import type { Resolver } from '../core/container/Container'
import type { Token } from '../core/container/Token'

import type { Dispatcher, EventConstructor } from './Dispatcher'
import type { EventSubscriber } from './EventSubscriber'
import type { Listener } from './Listener'

export class InMemoryDispatcher implements Dispatcher {
  readonly #resolver: Resolver
  readonly #bound = new Map<EventConstructor, Token<Listener<unknown>>[]>()

  constructor(resolver: Resolver) {
    this.#resolver = resolver
  }

  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void {
    const ctor = event as EventConstructor
    const current = this.#bound.get(ctor) ?? []
    current.push(listener as unknown as Token<Listener<unknown>>)
    this.#bound.set(ctor, current)
  }

  listenAny(_listener: Token<Listener<unknown>>): void {
    throw new Error('not implemented')
  }

  subscribe(_subscriber: Token<EventSubscriber>): void {
    throw new Error('not implemented')
  }

  async dispatch<E>(event: E): Promise<void> {
    const ctor = (event as object).constructor as EventConstructor
    const listeners = this.#bound.get(ctor) ?? []

    for (const token of listeners) {
      const listener = this.#resolver.make(token)
      await listener.handle(event)
    }
  }
}

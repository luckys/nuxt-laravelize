import type { Token } from '@nuxt-laravelize/core/runtime'

import type { EventConstructor, Listener } from './contracts'

export class EventListenerRegistry {
  readonly #listeners = new Map<EventConstructor, Token<Listener<unknown>>[]>()
  readonly #anyListeners: Token<Listener<unknown>>[] = []

  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void {
    const type = event as EventConstructor
    const listeners = this.#listeners.get(type) ?? []
    listeners.push(listener as Token<Listener<unknown>>)
    this.#listeners.set(type, listeners)
  }

  listenAny(listener: Token<Listener<unknown>>): void {
    this.#anyListeners.push(listener)
  }

  listenersFor(event: EventConstructor): readonly Token<Listener<unknown>>[] {
    return [...(this.#listeners.get(event) ?? [])]
  }

  anyListeners(): readonly Token<Listener<unknown>>[] {
    return [...this.#anyListeners]
  }
}

import type { Token } from '../core/container/Token'

import type { EventSubscriber } from './EventSubscriber'
import type { Listener } from './Listener'

export type EventConstructor<E = unknown> = new (...args: never[]) => E

export interface Dispatcher {
  listen<E>(event: EventConstructor<E>, listener: Token<Listener<E>>): void
  listenAny(listener: Token<Listener<unknown>>): void
  subscribe(subscriber: Token<EventSubscriber>): void
  dispatch<E>(event: E): Promise<void>
}

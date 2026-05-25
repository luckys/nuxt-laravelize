import type { Dispatcher } from './Dispatcher'

export interface EventSubscriber {
  subscribe(dispatcher: Dispatcher): void
}

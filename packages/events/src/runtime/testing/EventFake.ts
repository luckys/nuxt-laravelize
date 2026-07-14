import type { Dispatcher, EventConstructor, EventSubscriber, Listener } from '../contracts'
import type { Token } from '@nuxt-laravelize/core/runtime'

export class EventFake implements Dispatcher {
  readonly dispatched: unknown[] = []

  async dispatch<E>(event: E): Promise<void> { this.dispatched.push(event) }
  listen<E>(_event: EventConstructor<E>, _listener: Token<Listener<E>>): void {}
  listenAny(_listener: Token<Listener<unknown>>): void {}
  subscribe(_subscriber: Token<EventSubscriber>): void {}
  reset(): void { this.dispatched.length = 0 }

  assertDispatched<E>(eventClass: new (...args: never[]) => E, matcher?: (event: E) => boolean): void {
    const events = this.dispatched.filter(event => event instanceof eventClass) as E[]
    if (events.length === 0 || (matcher && !events.some(matcher))) {
      throw new Error(`Expected ${eventClass.name} to be dispatched.`)
    }
  }

  assertNotDispatched<E>(eventClass: new (...args: never[]) => E): void {
    if (this.dispatched.some(event => event instanceof eventClass)) {
      throw new Error(`Expected ${eventClass.name} not to be dispatched.`)
    }
  }
}

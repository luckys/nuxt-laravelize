import type { Dispatcher, EventConstructor } from '../../../events/Dispatcher'
import type { EventSubscriber } from '../../../events/EventSubscriber'
import type { Listener } from '../../../events/Listener'
import type { Token } from '../../../core/container/Token'

export class FakeDispatcher implements Dispatcher {
  readonly dispatched: unknown[] = []

  async dispatch<E>(event: E): Promise<void> {
    this.dispatched.push(event)
  }

  listen<E>(_event: EventConstructor<E>, _listener: Token<Listener<E>>): void {}
  listenAny(_listener: Token<Listener<unknown>>): void {}
  subscribe(_subscriber: Token<EventSubscriber>): void {}

  reset(): void { this.dispatched.length = 0 }

  assertDispatched<E>(
    eventClass: new (...args: never[]) => E,
    matcher?: (event: E) => boolean,
  ): void {
    const matches = this.dispatched.filter((e) => e instanceof eventClass) as E[]
    if (matches.length === 0) {
      throw new Error(`Expected an event of type ${eventClass.name} to be dispatched, none were.`)
    }
    if (matcher !== undefined && !matches.some(matcher)) {
      throw new Error(`Dispatched ${eventClass.name} events did not match the predicate.`)
    }
  }

  assertNothingDispatched(): void {
    if (this.dispatched.length > 0) {
      throw new Error(`Expected no events dispatched, but got ${this.dispatched.length}.`)
    }
  }

  assertNotDispatched<E>(eventClass: new (...args: never[]) => E): void {
    if (this.dispatched.some((e) => e instanceof eventClass)) {
      throw new Error(`Expected ${eventClass.name} NOT to be dispatched, but it was.`)
    }
  }
}

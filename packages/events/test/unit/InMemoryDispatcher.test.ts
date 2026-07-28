import { describe, expect, it, vi } from 'vitest'
import { createContainer, createToken, type Resolver } from '@nuxt-laravelize/core/runtime'

import { EventListenerRegistry } from '../../src/runtime/EventListenerRegistry'
import { InMemoryDispatcher } from '../../src/runtime/InMemoryDispatcher'
import EventsServiceProvider from '../../src/runtime/server/EventsServiceProvider'
import { dispatcherToken, eventListenerRegistryToken, queuedListenerAdapterToken } from '../../src/runtime/tokens'
import type { Listener, QueuedListenerAdapter } from '../../src/runtime/contracts'

class Event { readonly type = 'event' }

describe('InMemoryDispatcher', () => {
  it('resolves listeners in registration order and stops on false', async () => {
    const calls: number[] = []
    const first = createToken<Listener<Event>>('first')
    const second = createToken<Listener<Event>>('second')
    const resolver = createResolver(new Map([
      [first.key, { handle: () => {
        calls.push(1)
        return false
      } }],
      [second.key, { handle: () => { calls.push(2) } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)
    dispatcher.listen(Event, first)
    dispatcher.listen(Event, second)

    await dispatcher.dispatch(new Event())

    expect(calls).toEqual([1])
  })

  it('delegates marked listeners without depending on queue', async () => {
    const listener = createToken<Listener<Event>>('queued')
    const enqueue = vi.fn().mockResolvedValue(true)
    const resolver = createResolver(new Map([
      [listener.key, { shouldQueue: true, handle: vi.fn() }],
      [queuedListenerAdapterToken.key, { enqueue } satisfies QueuedListenerAdapter],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)
    dispatcher.listen(Event, listener)

    await dispatcher.dispatch(new Event())

    expect(enqueue).toHaveBeenCalledOnce()
  })

  it('shares boot listener definitions while resolving listeners from the current scope', async () => {
    const listener = createToken<Listener<Event>>('scoped-listener')
    const registry = new EventListenerRegistry()
    const calls: string[] = []
    const firstResolver = createResolver(new Map([[listener.key, { handle: () => calls.push('first') }]]))
    const secondResolver = createResolver(new Map([[listener.key, { handle: () => calls.push('second') }]]))
    const first = new InMemoryDispatcher(firstResolver, registry)
    const second = new InMemoryDispatcher(secondResolver, registry)
    registry.listen(Event, listener)

    await first.dispatch(new Event())
    await second.dispatch(new Event())

    expect(calls).toEqual(['first', 'second'])
  })

  it('keeps provider registrations visible in child scopes', async () => {
    const container = createContainer()
    const listener = createToken<Listener<Event>>('provider-listener')
    const calls: Event[] = []
    container.scoped(listener, () => ({
      handle: (event) => {
        calls.push(event)
      },
    }))
    new EventsServiceProvider().register(container)
    container.make(eventListenerRegistryToken).listen(Event, listener)

    await container.createScope().make(dispatcherToken).dispatch(new Event())

    expect(calls).toHaveLength(1)
  })

  it('keeps child-scope registrations local to that dispatcher', async () => {
    const container = createContainer()
    const listener = createToken<Listener<Event>>('local-listener')
    const calls: Event[] = []
    container.scoped(listener, () => ({
      handle: (event) => {
        calls.push(event)
      },
    }))
    new EventsServiceProvider().register(container)
    const first = container.createScope().make(dispatcherToken)
    const second = container.createScope().make(dispatcherToken)
    first.listen(Event, listener)

    await second.dispatch(new Event())
    await first.dispatch(new Event())

    expect(calls).toHaveLength(1)
  })
})

function createResolver(entries: Map<string, unknown>): Resolver {
  return {
    has: token => entries.has(token.key),
    make: token => entries.get(token.key) as never,
  }
}

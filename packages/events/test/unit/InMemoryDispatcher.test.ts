import { describe, expect, it, vi } from 'vitest'
import { createToken, type Resolver } from '@nuxt-laravelize/core/runtime'

import { InMemoryDispatcher } from '../../src/runtime/InMemoryDispatcher'
import { queuedListenerAdapterToken } from '../../src/runtime/tokens'
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
})

function createResolver(entries: Map<string, unknown>): Resolver {
  return {
    has: token => entries.has(token.key),
    make: token => entries.get(token.key) as never,
  }
}

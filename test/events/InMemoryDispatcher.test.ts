import { describe, expect, it, vi } from 'vitest'

import type { Resolver } from '../../src/core/container/Container'
import { createToken } from '../../src/core/container/Token'
import type { Token } from '../../src/core/container/Token'

import { InMemoryDispatcher } from '../../src/events/InMemoryDispatcher'
import type { Listener } from '../../src/events/Listener'

class UserRegistered {
  constructor(public readonly userId: string) {}
}

class UserDeleted {
  constructor(public readonly userId: string) {}
}

function createResolver(map: Map<string, unknown>): Resolver {
  return {
    make<T>(token: Token<T>): T {
      return map.get(token.key) as T
    },
    has(token: Token<unknown>): boolean {
      return map.has(token.key)
    },
  }
}

describe('InMemoryDispatcher — listen/dispatch core', () => {
  it('registers a listener and dispatch invokes it with the event', async () => {
    const handle = vi.fn()
    const token = createToken<Listener<UserRegistered>>('listener')
    const dispatcher = new InMemoryDispatcher(createResolver(new Map([['listener', { handle }]])))

    dispatcher.listen(UserRegistered, token)
    const event = new UserRegistered('u-1')
    await dispatcher.dispatch(event)

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle).toHaveBeenCalledWith(event)
  })

  it('resolves the listener via the container at dispatch time (not at listen time)', async () => {
    let resolveCount = 0
    const token = createToken<Listener<UserRegistered>>('listener')
    const resolver: Resolver = {
      make: <T>(_token: Token<T>): T => {
        resolveCount += 1
        return { handle: () => {} } as unknown as T
      },
      has: () => true,
    }
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)
    expect(resolveCount).toBe(0)

    await dispatcher.dispatch(new UserRegistered('u-1'))
    expect(resolveCount).toBe(1)
  })

  it('dispatch with no listeners is a silent no-op', async () => {
    const dispatcher = new InMemoryDispatcher(createResolver(new Map()))

    await expect(dispatcher.dispatch(new UserRegistered('u-1'))).resolves.toBeUndefined()
  })

  it('invokes multiple listeners in registration order', async () => {
    const calls: string[] = []
    const tokenA = createToken<Listener<UserRegistered>>('a')
    const tokenB = createToken<Listener<UserRegistered>>('b')
    const resolver = createResolver(new Map<string, unknown>([
      ['a', { handle: () => { calls.push('a') } }],
      ['b', { handle: () => { calls.push('b') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, tokenA)
    dispatcher.listen(UserRegistered, tokenB)
    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(calls).toEqual(['a', 'b'])
  })

  it('awaits a sync listener correctly', async () => {
    const calls: string[] = []
    const token = createToken<Listener<UserRegistered>>('l')
    const resolver = createResolver(new Map<string, unknown>([
      ['l', { handle: () => { calls.push('sync') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)
    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(calls).toEqual(['sync'])
  })

  it('awaits an async listener correctly', async () => {
    const calls: string[] = []
    const token = createToken<Listener<UserRegistered>>('l')
    const resolver = createResolver(new Map<string, unknown>([
      ['l', {
        handle: async () => {
          await Promise.resolve()
          calls.push('async')
        },
      }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)
    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(calls).toEqual(['async'])
  })

  it('rejects with the same error when a sync listener throws', async () => {
    const boom = new Error('boom')
    const token = createToken<Listener<UserRegistered>>('l')
    const resolver = createResolver(new Map<string, unknown>([
      ['l', { handle: () => { throw boom } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)

    await expect(dispatcher.dispatch(new UserRegistered('u-1'))).rejects.toBe(boom)
  })

  it('rejects when an async listener rejects', async () => {
    const boom = new Error('async boom')
    const token = createToken<Listener<UserRegistered>>('l')
    const resolver = createResolver(new Map<string, unknown>([
      ['l', { handle: async () => { throw boom } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)

    await expect(dispatcher.dispatch(new UserRegistered('u-1'))).rejects.toBe(boom)
  })

  it('fail-fast: a listener that throws prevents later listeners from running', async () => {
    const calls: string[] = []
    const boom = new Error('stop')
    const tokenA = createToken<Listener<UserRegistered>>('a')
    const tokenB = createToken<Listener<UserRegistered>>('b')
    const tokenC = createToken<Listener<UserRegistered>>('c')
    const resolver = createResolver(new Map<string, unknown>([
      ['a', { handle: () => { calls.push('a') } }],
      ['b', { handle: () => { throw boom } }],
      ['c', { handle: () => { calls.push('c') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, tokenA)
    dispatcher.listen(UserRegistered, tokenB)
    dispatcher.listen(UserRegistered, tokenC)

    await expect(dispatcher.dispatch(new UserRegistered('u-1'))).rejects.toBe(boom)
    expect(calls).toEqual(['a'])
  })

  it('does not cross-fire listeners registered for different events', async () => {
    const calls: string[] = []
    const tokenA = createToken<Listener<UserRegistered>>('a')
    const tokenB = createToken<Listener<UserDeleted>>('b')
    const resolver = createResolver(new Map<string, unknown>([
      ['a', { handle: () => { calls.push('a') } }],
      ['b', { handle: () => { calls.push('b') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, tokenA)
    dispatcher.listen(UserDeleted, tokenB)

    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(calls).toEqual(['a'])
  })

  it('executes a listener twice when registered twice for the same event', async () => {
    const handle = vi.fn()
    const token = createToken<Listener<UserRegistered>>('l')
    const resolver = createResolver(new Map<string, unknown>([
      ['l', { handle }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)
    dispatcher.listen(UserRegistered, token)
    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(handle).toHaveBeenCalledTimes(2)
  })

  it('passes the exact instance to handle (reference equality)', async () => {
    const handle = vi.fn()
    const token = createToken<Listener<UserRegistered>>('l')
    const resolver = createResolver(new Map<string, unknown>([
      ['l', { handle }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, token)
    const event = new UserRegistered('u-1')
    await dispatcher.dispatch(event)

    expect(handle.mock.calls[0]?.[0]).toBe(event)
  })
})

describe('InMemoryDispatcher — listenAny', () => {
  it('receives an event that has no specific listeners', async () => {
    const handle = vi.fn()
    const token = createToken<Listener<unknown>>('any')
    const resolver = createResolver(new Map<string, unknown>([['any', { handle }]]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listenAny(token)
    const event = new UserRegistered('u-1')
    await dispatcher.dispatch(event)

    expect(handle).toHaveBeenCalledWith(event)
  })

  it('receives an event that also has specific listeners', async () => {
    const calls: string[] = []
    const specificToken = createToken<Listener<UserRegistered>>('specific')
    const anyToken = createToken<Listener<unknown>>('any')
    const resolver = createResolver(new Map<string, unknown>([
      ['specific', { handle: () => { calls.push('specific') } }],
      ['any', { handle: () => { calls.push('any') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, specificToken)
    dispatcher.listenAny(anyToken)
    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(calls).toEqual(['specific', 'any'])
  })

  it('runs listenAny listeners in registration order after specific listeners', async () => {
    const calls: string[] = []
    const anyA = createToken<Listener<unknown>>('anyA')
    const anyB = createToken<Listener<unknown>>('anyB')
    const resolver = createResolver(new Map<string, unknown>([
      ['anyA', { handle: () => { calls.push('anyA') } }],
      ['anyB', { handle: () => { calls.push('anyB') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listenAny(anyA)
    dispatcher.listenAny(anyB)
    await dispatcher.dispatch(new UserRegistered('u-1'))

    expect(calls).toEqual(['anyA', 'anyB'])
  })

  it('zero listenAny listeners is harmless', async () => {
    const dispatcher = new InMemoryDispatcher(createResolver(new Map()))

    await expect(dispatcher.dispatch(new UserRegistered('u-1'))).resolves.toBeUndefined()
  })

  it('listenAny error fails fast (same semantics as specific listeners)', async () => {
    const boom = new Error('boom')
    const specificToken = createToken<Listener<UserRegistered>>('spec')
    const anyToken = createToken<Listener<unknown>>('any')
    const followAnyToken = createToken<Listener<unknown>>('follow')
    const followCalls: string[] = []
    const resolver = createResolver(new Map<string, unknown>([
      ['spec', { handle: () => {} }],
      ['any', { handle: () => { throw boom } }],
      ['follow', { handle: () => { followCalls.push('follow') } }],
    ]))
    const dispatcher = new InMemoryDispatcher(resolver)

    dispatcher.listen(UserRegistered, specificToken)
    dispatcher.listenAny(anyToken)
    dispatcher.listenAny(followAnyToken)

    await expect(dispatcher.dispatch(new UserRegistered('u-1'))).rejects.toBe(boom)
    expect(followCalls).toEqual([])
  })
})

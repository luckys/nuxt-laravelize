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

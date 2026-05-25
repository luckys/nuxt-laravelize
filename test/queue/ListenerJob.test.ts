import { describe, expect, it, vi } from 'vitest'

import type { Resolver } from '../../src/core/container/Container'
import { createToken } from '../../src/core/container/Token'
import type { Listener } from '../../src/events/Listener'
import { InMemoryJobRegistry } from '../../src/queue/InMemoryJobRegistry'
import { ListenerJob } from '../../src/queue/ListenerJob'

class UserRegistered {
  constructor(public readonly userId: string) {}
}

describe('ListenerJob', () => {
  it('exposes static tries=3 and queue="laravelize.listeners"', () => {
    expect(ListenerJob.tries).toBe(3)
    expect(ListenerJob.queue).toBe('laravelize.listeners')
  })

  it('serialize returns the documented shape', () => {
    const payload = { listenerTokenKey: 'l', eventConstructorName: 'UserRegistered', eventArgs: ['u-1'] }
    const job = new ListenerJob(payload)
    expect(job.serialize()).toEqual({ name: 'laravelize.ListenerJob', args: [payload] })
  })

  it('handle resolves listener via container, reconstructs event, invokes handle', async () => {
    const handle = vi.fn()
    const listenerToken = createToken<Listener<UserRegistered>>('listener')
    const resolver: Resolver = {
      make<T>(_token: { key: string }): T { return ({ handle } as unknown) as T },
      has() { return true },
    }
    const registry = new InMemoryJobRegistry()
    registry.registerEvent('UserRegistered', UserRegistered)

    const job = new ListenerJob({
      listenerTokenKey: listenerToken.key,
      eventConstructorName: 'UserRegistered',
      eventArgs: ['u-1'],
    })

    await job.handle(resolver, registry)

    expect(handle).toHaveBeenCalledTimes(1)
    const received = handle.mock.calls[0]?.[0] as UserRegistered
    expect(received).toBeInstanceOf(UserRegistered)
    expect(received.userId).toBe('u-1')
  })

  it('handle propagates the listener error', async () => {
    const boom = new Error('listener boom')
    const resolver: Resolver = {
      make<T>(): T {
        const mockHandle = () => {
          throw boom
        }
        return ({ handle: mockHandle } as unknown) as T
      },
      has() { return true },
    }
    const registry = new InMemoryJobRegistry()
    registry.registerEvent('UserRegistered', UserRegistered)

    const job = new ListenerJob({
      listenerTokenKey: 'l',
      eventConstructorName: 'UserRegistered',
      eventArgs: ['u-1'],
    })

    await expect(job.handle(resolver, registry)).rejects.toBe(boom)
  })

  it('handle throws EventNotRegisteredError when event missing in registry', async () => {
    const resolver: Resolver = {
      make<T>(): T { return ({ handle: () => {} } as unknown) as T },
      has() { return true },
    }
    const registry = new InMemoryJobRegistry()

    const job = new ListenerJob({
      listenerTokenKey: 'l',
      eventConstructorName: 'MissingEvent',
      eventArgs: [],
    })

    await expect(job.handle(resolver, registry)).rejects.toMatchObject({ name: 'EventNotRegisteredError' })
  })

  it('handle propagates container error when listener token cannot be resolved', async () => {
    const boom = new Error('not registered')
    const resolver: Resolver = {
      make() { throw boom },
      has() { return false },
    }
    const registry = new InMemoryJobRegistry()
    registry.registerEvent('UserRegistered', UserRegistered)

    const job = new ListenerJob({
      listenerTokenKey: 'missing',
      eventConstructorName: 'UserRegistered',
      eventArgs: ['u-1'],
    })

    await expect(job.handle(resolver, registry)).rejects.toBe(boom)
  })
})

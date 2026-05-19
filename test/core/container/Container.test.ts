import { describe, expect, it } from 'vitest'

import { createContainer } from '../../../src/core/container/Container'
import {
  CircularDependencyError,
  KernelAlreadyBootedError,
  ServiceNotRegisteredError,
} from '../../../src/core/container/ContainerErrors'
import { createToken } from '../../../src/core/container/Token'

describe('Container', () => {
  it('resolves a bound service through its factory', () => {
    const container = createContainer()
    const greetingToken = createToken<string>('greeting')

    container.bind(greetingToken, () => 'hello')

    expect(container.make(greetingToken)).toBe('hello')
  })

  it('bind produces a new instance on every make (transient)', () => {
    const container = createContainer()
    const token = createToken<object>('transient.obj')

    container.bind(token, () => ({}))

    expect(container.make(token)).not.toBe(container.make(token))
  })

  it('singleton produces the same instance on every make', () => {
    const container = createContainer()
    const token = createToken<object>('singleton.obj')

    container.singleton(token, () => ({}))

    expect(container.make(token)).toBe(container.make(token))
  })

  it('singleton caches falsy values instead of rebuilding them', () => {
    const container = createContainer()
    const token = createToken<number>('falsy.zero')
    let factoryCalls = 0

    container.singleton(token, () => {
      factoryCalls += 1
      return 0
    })

    expect(container.make(token)).toBe(0)
    expect(container.make(token)).toBe(0)
    expect(factoryCalls).toBe(1)
  })

  it('instance registers an already built value', () => {
    const container = createContainer()
    const token = createToken<{ name: string }>('config')
    const value = { name: 'laravelize' }

    container.instance(token, value)

    expect(container.make(token)).toBe(value)
  })

  it('make throws ServiceNotRegisteredError for an unknown token', () => {
    const container = createContainer()
    const token = createToken<string>('missing')

    expect(() => container.make(token)).toThrow(ServiceNotRegisteredError)
  })

  it('has reports whether a token is registered', () => {
    const container = createContainer()
    const token = createToken<string>('known')

    expect(container.has(token)).toBe(false)
    container.bind(token, () => 'value')
    expect(container.has(token)).toBe(true)
  })

  it('resolves dependencies between services through the factory resolver', () => {
    const container = createContainer()
    const dependencyToken = createToken<number>('dependency')
    const consumerToken = createToken<number>('consumer')

    container.singleton(dependencyToken, () => 21)
    container.singleton(consumerToken, resolver => resolver.make(dependencyToken) * 2)

    expect(container.make(consumerToken)).toBe(42)
  })

  it('throws CircularDependencyError when two services depend on each other', () => {
    const container = createContainer()
    const aToken = createToken<string>('cycle.a')
    const bToken = createToken<string>('cycle.b')

    container.singleton(aToken, resolver => resolver.make(bToken))
    container.singleton(bToken, resolver => resolver.make(aToken))

    expect(() => container.make(aToken)).toThrow(CircularDependencyError)
  })

  it('shares singletons but isolates scoped services across scopes', () => {
    const container = createContainer()
    const singletonToken = createToken<object>('shared')
    const scopedToken = createToken<object>('per-scope')

    container.singleton(singletonToken, () => ({}))
    container.scoped(scopedToken, () => ({}))

    const firstScope = container.createScope()
    const secondScope = container.createScope()

    expect(firstScope.make(singletonToken)).toBe(secondScope.make(singletonToken))
    expect(firstScope.make(scopedToken)).toBe(firstScope.make(scopedToken))
    expect(firstScope.make(scopedToken)).not.toBe(secondScope.make(scopedToken))
  })

  it('rejects registrations after the container is sealed', () => {
    const container = createContainer()
    const token = createToken<string>('late')

    container.seal()

    expect(() => container.bind(token, () => 'too late')).toThrow(KernelAlreadyBootedError)
  })
})

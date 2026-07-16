import {
  asFunction,
  asValue,
  AwilixResolutionError,
  createContainer as createAwilixContainer,
  Lifetime,
  type AwilixContainer,
  type LifetimeType,
} from 'awilix'

import {
  CircularDependencyError,
  KernelAlreadyBootedError,
  ServiceNotRegisteredError,
} from './ContainerErrors'
import type { Token } from './Token'

export interface Resolver {
  make<T>(token: Token<T>): T
  has(token: Token<unknown>): boolean
}

export type ServiceFactory<T> = (resolver: Resolver) => T

export interface Container extends Resolver {
  bind<T>(token: Token<T>, factory: ServiceFactory<T>): void
  singleton<T>(token: Token<T>, factory: ServiceFactory<T>): void
  scoped<T>(token: Token<T>, factory: ServiceFactory<T>): void
  instance<T>(token: Token<T>, value: T): void
  createScope(): Container
  override<T>(token: Token<T>, value: T): void
  seal(): void
  dispose(): Promise<void>
}

type Cradle = Record<string, unknown>

function translateResolutionError(error: unknown, serviceKey: string): Error {
  if (error instanceof CircularDependencyError || error instanceof ServiceNotRegisteredError) {
    return error
  }

  if (!(error instanceof AwilixResolutionError)) {
    return error instanceof Error ? error : new Error(String(error))
  }

  if (error.message.includes('Cyclic')) {
    return new CircularDependencyError(error.message)
  }

  return new ServiceNotRegisteredError(serviceKey)
}

class CradleResolver implements Resolver {
  readonly #cradle: Cradle
  readonly #owner: Resolver

  constructor(cradle: Cradle, owner: Resolver) {
    this.#cradle = cradle
    this.#owner = owner
  }

  make<T>(token: Token<T>): T {
    try {
      return this.#cradle[token.key] as T
    }
    catch (error) {
      throw translateResolutionError(error, token.key)
    }
  }

  has(token: Token<unknown>): boolean {
    if (this.#owner.has(token)) return true
    try {
      void this.#cradle[token.key]
      return true
    }
    catch (error) {
      if (error instanceof AwilixResolutionError) return false
      throw error
    }
  }
}

class AwilixBackedContainer implements Container {
  readonly #awilix: AwilixContainer
  readonly #isScope: boolean
  #sealed = false

  constructor(awilixContainer: AwilixContainer, isScope = false) {
    this.#awilix = awilixContainer
    this.#isScope = isScope
  }

  bind<T>(token: Token<T>, factory: ServiceFactory<T>): void {
    this.#register(token, factory, Lifetime.TRANSIENT)
  }

  singleton<T>(token: Token<T>, factory: ServiceFactory<T>): void {
    this.#register(token, factory, Lifetime.SINGLETON)
  }

  scoped<T>(token: Token<T>, factory: ServiceFactory<T>): void {
    this.#register(token, factory, Lifetime.SCOPED)
  }

  instance<T>(token: Token<T>, value: T): void {
    this.#ensureNotSealed()
    this.#awilix.register(token.key, asValue(value))
  }

  make<T>(token: Token<T>): T {
    try {
      return this.#awilix.resolve<T>(token.key)
    }
    catch (error) {
      throw translateResolutionError(error, token.key)
    }
  }

  has(token: Token<unknown>): boolean {
    return this.#awilix.hasRegistration(token.key)
  }

  createScope(): Container {
    return new AwilixBackedContainer(this.#awilix.createScope(), true)
  }

  override<T>(token: Token<T>, value: T): void {
    if (!this.#isScope) throw new KernelAlreadyBootedError()
    this.#awilix.register(token.key, asValue(value))
  }

  seal(): void {
    this.#sealed = true
  }

  async dispose(): Promise<void> {
    await this.#awilix.dispose()
  }

  #register<T>(token: Token<T>, factory: ServiceFactory<T>, lifetime: LifetimeType): void {
    this.#ensureNotSealed()
    const owner = this as Container
    this.#awilix.register(
      token.key,
      asFunction((cradle: Cradle) => factory(new CradleResolver(cradle, owner))).setLifetime(lifetime),
    )
  }

  #ensureNotSealed(): void {
    if (this.#sealed) {
      throw new KernelAlreadyBootedError()
    }
  }
}

export function createContainer(): Container {
  return new AwilixBackedContainer(createAwilixContainer())
}

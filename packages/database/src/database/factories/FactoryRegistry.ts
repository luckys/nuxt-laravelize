import type { Factory } from './Factory'

export type FactoryFactory<T = unknown, TPersisted = T, Count extends number = 1>
  = () => Factory<T, TPersisted, Count>

export interface FactoryRegistry {
  register<T, TPersisted, Count extends number>(
    name: string,
    factory: FactoryFactory<T, TPersisted, Count>,
  ): void
  list(): readonly string[]
  resolve(name: string): Factory<unknown>
  has(name: string): boolean
}

export class DefaultFactoryRegistry implements FactoryRegistry {
  readonly #factories = new Map<string, () => unknown>()

  register<T, TPersisted, Count extends number>(
    name: string,
    factory: FactoryFactory<T, TPersisted, Count>,
  ): void {
    this.#factories.set(name, factory)
  }

  list(): readonly string[] {
    return [...this.#factories.keys()]
  }

  has(name: string): boolean {
    return this.#factories.has(name)
  }

  resolve(name: string): Factory<unknown> {
    const f = this.#factories.get(name)
    if (f === undefined) throw new UnknownFactory(name)
    return f() as Factory<unknown>
  }
}

export class UnknownFactory extends Error {
  constructor(name: string) {
    super(`Factory "${name}" is not registered`)
    this.name = 'UnknownFactory'
  }
}

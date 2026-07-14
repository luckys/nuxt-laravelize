import type { Factory } from './Factory'

export type FactoryFactory = () => Factory<unknown>

export interface FactoryRegistry {
  register(name: string, factory: FactoryFactory): void
  list(): readonly string[]
  resolve(name: string): Factory<unknown>
  has(name: string): boolean
}

export class DefaultFactoryRegistry implements FactoryRegistry {
  readonly #factories = new Map<string, FactoryFactory>()

  register(name: string, factory: FactoryFactory): void {
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
    return f()
  }
}

export class UnknownFactory extends Error {
  constructor(name: string) {
    super(`Factory "${name}" is not registered`)
    this.name = 'UnknownFactory'
  }
}

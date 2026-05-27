import type { Seeder } from './Seeder'

export type SeederFactory = () => Seeder | Promise<Seeder>

export interface SeederRegistry {
  register(name: string, factory: SeederFactory): void
  list(): readonly string[]
  resolve(name: string): Promise<Seeder>
  has(name: string): boolean
}

export class DefaultSeederRegistry implements SeederRegistry {
  readonly #factories = new Map<string, SeederFactory>()

  register(name: string, factory: SeederFactory): void {
    this.#factories.set(name, factory)
  }

  list(): readonly string[] {
    return [...this.#factories.keys()]
  }

  has(name: string): boolean {
    return this.#factories.has(name)
  }

  async resolve(name: string): Promise<Seeder> {
    const factory = this.#factories.get(name)
    if (factory === undefined) throw new UnknownSeeder(name)
    return await factory()
  }
}

export class UnknownSeeder extends Error {
  constructor(name: string) {
    super(`Seeder "${name}" is not registered`)
    this.name = 'UnknownSeeder'
  }
}

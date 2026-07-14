import type { SeederRegistry } from './SeederRegistry'

export abstract class Seeder {
  #registry: SeederRegistry | null = null

  /** @internal */
  _setRegistry(registry: SeederRegistry): void {
    this.#registry = registry
  }

  /** Run another seeder by name, registered in the same SeederRegistry. */
  protected async call(name: string): Promise<void> {
    if (!this.#registry) {
      throw new Error(
        'Seeder.call() requires a SeederRegistry — ensure this seeder was resolved via SeederRegistry.resolve()',
      )
    }
    const seeder = await this.#registry.resolve(name)
    seeder._setRegistry(this.#registry)
    await seeder.run()
  }

  abstract run(): Promise<void>
}

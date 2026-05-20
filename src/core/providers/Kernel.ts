import type { Container } from '../container/Container'
import { ProviderBootError } from '../container/ContainerErrors'
import type { ServiceProvider } from './ServiceProvider'

export type ServiceProviderClass = new () => ServiceProvider

export class Kernel {
  readonly #container: Container
  readonly #providerClasses: readonly ServiceProviderClass[]

  constructor(container: Container, providerClasses: readonly ServiceProviderClass[]) {
    this.#container = container
    this.#providerClasses = providerClasses
  }

  async boot(): Promise<void> {
    const providers = this.#providerClasses.map(ProviderClass => new ProviderClass())

    for (const provider of providers) {
      provider.register(this.#container)
    }

    for (const provider of providers) {
      await this.#bootProvider(provider)
    }

    this.#container.seal()
  }

  async #bootProvider(provider: ServiceProvider): Promise<void> {
    if (!provider.boot) {
      return
    }

    try {
      await provider.boot(this.#container)
    }
    catch (error) {
      throw new ProviderBootError(provider.constructor.name, error)
    }
  }
}

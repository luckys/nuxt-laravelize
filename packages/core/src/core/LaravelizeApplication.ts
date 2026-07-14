import { createContainer, type Container } from './container/Container'
import { Kernel, type ServiceProviderClass } from './providers/Kernel'

export class LaravelizeApplication {
  readonly #container: Container
  readonly #kernel: Kernel
  #bootPromise: Promise<void> | undefined

  constructor(providers: readonly ServiceProviderClass[], container: Container = createContainer()) {
    this.#container = container
    this.#kernel = new Kernel(container, providers)
  }

  boot(): Promise<void> {
    this.#bootPromise ??= this.#kernel.boot()
    return this.#bootPromise
  }

  async createScope(): Promise<Container> {
    await this.boot()
    return this.#container.createScope()
  }

  async close(): Promise<void> {
    await this.#container.dispose()
  }
}

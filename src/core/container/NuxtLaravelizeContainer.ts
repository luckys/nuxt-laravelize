export type ContainerServiceFactory<TService> = () => TService

export class NuxtLaravelizeContainer {
  readonly #instances = new Map<string, unknown>()
  readonly #factories = new Map<string, ContainerServiceFactory<unknown>>()

  register<TService>(serviceKey: string, factory: ContainerServiceFactory<TService>) {
    this.#factories.set(serviceKey, factory)
    return this
  }

  resolve<TService>(serviceKey: string): TService {
    const instance = this.#instances.get(serviceKey)

    if (instance) {
      return instance as TService
    }

    const factory = this.#factories.get(serviceKey)

    if (!factory) {
      throw new Error(`Service not registered: ${serviceKey}`)
    }

    const builtInstance = factory()
    this.#instances.set(serviceKey, builtInstance)

    return builtInstance as TService
  }

  createScope() {
    const scopedContainer = new NuxtLaravelizeContainer()

    for (const [serviceKey, factory] of this.#factories.entries()) {
      scopedContainer.register(serviceKey, factory)
    }

    return scopedContainer
  }
}

const rootContainer = new NuxtLaravelizeContainer()

export function createNuxtLaravelizeContainer() {
  return rootContainer.createScope()
}

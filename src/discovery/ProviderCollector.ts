import type { DiscoveredProviders } from './byConvention'

export type ProviderTarget = 'server' | 'client' | 'shared'

export class ProviderCollector {
  readonly #server = new Set<string>()
  readonly #client = new Set<string>()
  readonly #registered = new Set<string>()

  addFromConvention(discovered: DiscoveredProviders): void {
    for (const path of discovered.server) {
      this.#server.add(path)
      this.#registered.add(path)
    }

    for (const path of discovered.client) {
      this.#client.add(path)
      this.#registered.add(path)
    }
  }

  addFromConfig(paths: readonly string[], target: ProviderTarget): void {
    for (const path of paths) {
      this.#addOne(path, target)
    }
  }

  addFromApi(path: string, target: ProviderTarget): void {
    this.#addOne(path, target)
  }

  collect(): DiscoveredProviders {
    return {
      server: [...this.#server],
      client: [...this.#client],
    }
  }

  #addOne(path: string, target: ProviderTarget): void {
    if (this.#registered.has(path)) {
      return
    }

    this.#registered.add(path)

    if (target === 'server' || target === 'shared') {
      this.#server.add(path)
    }

    if (target === 'client' || target === 'shared') {
      this.#client.add(path)
    }
  }
}

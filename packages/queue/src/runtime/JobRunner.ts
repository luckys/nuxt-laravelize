import type { Container } from '@nuxt-laravelize/core/runtime'

import type { SerializedJob } from './Job'
import type { InMemoryJobRegistry } from './JobRegistry'

export class JobRunner {
  constructor(
    private readonly rootContainer: Container,
    private readonly registry: InMemoryJobRegistry,
  ) {}

  async run(serialized: SerializedJob): Promise<void> {
    const scope = this.rootContainer.createScope()
    try {
      await this.registry.rehydrate(serialized).handle(scope)
    }
    finally {
      await scope.dispose()
    }
  }

  async failed(serialized: SerializedJob, error: unknown): Promise<void> {
    await this.registry.rehydrate(serialized).failed?.(error)
  }
}

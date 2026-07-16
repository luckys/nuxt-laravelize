import type { Container } from '@nuxt-laravelize/core/runtime'

import type { SerializedJob } from './Job'
import type { InMemoryJobRegistry } from './JobRegistry'

export type JobScopeContributor = (serialized: SerializedJob, scope: Container) => void | Promise<void>
export type JobExecutionMiddleware = (serialized: SerializedJob, scope: Container, next: () => Promise<void>) => Promise<void>

export class JobRunner {
  readonly #contributors: JobScopeContributor[] = []
  readonly #middleware: JobExecutionMiddleware[] = []
  constructor(
    private readonly rootContainer: Container,
    private readonly registry: InMemoryJobRegistry,
  ) {}

  contributeScope(contributor: JobScopeContributor): void { this.#contributors.push(contributor) }
  use(middleware: JobExecutionMiddleware): void { this.#middleware.push(middleware) }

  async run(serialized: SerializedJob): Promise<void> {
    await this.#execute(serialized, async scope => this.registry.rehydrate(serialized).handle(scope))
  }

  async failed(serialized: SerializedJob, error: unknown): Promise<void> {
    await this.#execute(serialized, async () => this.registry.rehydrate(serialized).failed?.(error))
  }

  async #execute(serialized: SerializedJob, operation: (scope: Container) => void | Promise<void>): Promise<void> {
    const scope = this.rootContainer.createScope()
    try {
      for (const contributor of this.#contributors) await contributor(serialized, scope)
      const invoke = this.#middleware.reduceRight<() => Promise<void>>(
        (next, middleware) => () => middleware(serialized, scope, next),
        async () => operation(scope),
      )
      await invoke()
    }
    finally {
      await scope.dispose()
    }
  }
}

import type { Container } from '@nuxt-laravelize/core/runtime'

import type { SerializedJob } from './Job'
import type { InMemoryJobRegistry } from './JobRegistry'

export type JobScopeContributor = (serialized: SerializedJob, scope: Container) => void | Promise<void>
export interface JobExecutionDescriptor { readonly queue?: string, readonly attempt?: number, readonly maxAttempts?: number, readonly phase: 'process' | 'failed' }
export type JobExecutionMiddleware = (serialized: SerializedJob, scope: Container, next: () => Promise<void>, descriptor?: JobExecutionDescriptor) => Promise<void>
interface MiddlewareRegistration { readonly id: string, readonly order: number, readonly sequence: number, readonly middleware: JobExecutionMiddleware }

export class JobRunner {
  readonly #contributors: JobScopeContributor[] = []
  readonly #middleware: MiddlewareRegistration[] = []
  #sequence = 0
  constructor(
    private readonly rootContainer: Container,
    private readonly registry: InMemoryJobRegistry,
  ) {}

  contributeScope(contributor: JobScopeContributor): void { this.#contributors.push(contributor) }
  hasMiddleware(id: string): boolean { return this.#middleware.some(item => item.id === id) }
  use(middleware: JobExecutionMiddleware): void
  use(id: string, middleware: JobExecutionMiddleware, order?: number): void
  use(idOrMiddleware: string | JobExecutionMiddleware, middleware?: JobExecutionMiddleware, order = 0): void {
    const id = typeof idOrMiddleware === 'string' ? idOrMiddleware : `anonymous:${this.#sequence}`
    const value = typeof idOrMiddleware === 'string' ? middleware : idOrMiddleware
    if (!value || !id || this.#middleware.some(item => item.id === id)) throw new TypeError(`Duplicate or invalid job middleware id: ${id}`)
    this.#middleware.push({ id, middleware: value, order, sequence: this.#sequence++ })
    this.#middleware.sort((left, right) => left.order - right.order || left.sequence - right.sequence)
  }

  async run(serialized: SerializedJob, descriptor: Omit<JobExecutionDescriptor, 'phase'> = {}): Promise<void> {
    await this.#execute(serialized, { ...descriptor, phase: 'process' }, async scope => this.registry.rehydrate(serialized).handle(scope))
  }

  async failed(serialized: SerializedJob, error: unknown, descriptor: Omit<JobExecutionDescriptor, 'phase'> = {}): Promise<void> {
    await this.#execute(serialized, { ...descriptor, phase: 'failed' }, async () => this.registry.rehydrate(serialized).failed?.(error))
  }

  async #execute(serialized: SerializedJob, descriptor: JobExecutionDescriptor, operation: (scope: Container) => void | Promise<void>): Promise<void> {
    assertSerializedJob(serialized)
    const scope = this.rootContainer.createScope()
    try {
      for (const contributor of this.#contributors) await contributor(serialized, scope)
      const invoke = this.#middleware.reduceRight<() => Promise<void>>(
        (next, registration) => () => registration.middleware(serialized, scope, next, descriptor),
        async () => operation(scope),
      )
      await invoke()
    }
    finally {
      await scope.dispose()
    }
  }
}

function assertSerializedJob(value: unknown): asserts value is SerializedJob {
  try {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Envelope must be a plain object')
    const job = value as Partial<SerializedJob>
    if ((job.version !== 1 && job.version !== 2) || typeof job.name !== 'string' || !job.name || job.name.length > 256 || !job.payload || Object.getPrototypeOf(job.payload) !== Object.prototype) throw new TypeError('Envelope fields are invalid')
    if (job.version === 2 && (!job.metadata || Object.getPrototypeOf(job.metadata) !== Object.prototype || Object.keys(job.metadata).length > 64)) throw new TypeError('Envelope metadata is invalid')
  }
  catch { throw new TypeError('Invalid serialized job envelope') }
}

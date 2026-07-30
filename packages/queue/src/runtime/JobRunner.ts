import type { Container } from '@nuxt-laravelize/core/runtime'

import { JOB_DISPATCH_METADATA_KEY, MAX_JOB_METADATA_KEYS, readJobDispatchIdentity, snapshotJobPayload, type Job, type SerializedJob } from './Job'
import type { InMemoryJobRegistry } from './JobRegistry'
import { NonRetryableJobError } from './NonRetryableJobError'

export type JobScopeContributor = (serialized: SerializedJob, scope: Container) => void | Promise<void>
export interface JobExecutionDescriptor { readonly queue?: string, readonly attempt?: number, readonly maxAttempts?: number, readonly phase: 'process' | 'failed', readonly runner?: JobRunner }
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
  canonicalJobName(name: string): string | undefined { return this.registry.canonicalName(name) }
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

  async run(serialized: SerializedJob, descriptor: Omit<JobExecutionDescriptor, 'phase' | 'runner'> = {}): Promise<void> {
    await this.#execute(serialized, { ...descriptor, phase: 'process', runner: this }, async (execution, scope) => this.registry.rehydrate(execution).handle(scope))
  }

  async failed(serialized: SerializedJob, error: unknown, descriptor: Omit<JobExecutionDescriptor, 'phase' | 'runner'> = {}): Promise<void> {
    await this.#execute(serialized, { ...descriptor, phase: 'failed', runner: this }, async execution => this.registry.rehydrate(execution).failed?.(error))
  }

  prepare(serialized: SerializedJob): SerializedJob {
    try {
      assertSerializedJob(serialized)
      const payload = verifyDispatchIdentity(serialized)
      if (serialized.version === 1) return { ...serialized, payload }
      return { ...serialized, payload, metadata: cloneMetadata(serialized.metadata) }
    }
    catch { throw invalidDispatch() }
  }

  rehydrate(serialized: SerializedJob): Job { return this.registry.rehydrate(this.prepare(serialized)) }

  async #execute(serialized: SerializedJob, descriptor: JobExecutionDescriptor, operation: (execution: SerializedJob, scope: Container) => void | Promise<void>): Promise<void> {
    const execution = this.prepare(serialized)
    const scope = this.rootContainer.createScope()
    try {
      for (const contributor of this.#contributors) await contributor(execution, scope)
      const invoke = this.#middleware.reduceRight<() => Promise<void>>(
        (next, registration) => () => registration.middleware(execution, scope, next, descriptor),
        async () => operation(execution, scope),
      )
      await invoke()
    }
    finally {
      await scope.dispose()
    }
  }
}

function verifyDispatchIdentity(serialized: SerializedJob): Record<string, unknown> {
  try {
    const identity = readJobDispatchIdentity(serialized)
    const snapshot = snapshotJobPayload(serialized.payload)
    if (identity && identity.payloadFingerprint !== snapshot.fingerprint) throw new TypeError('Job payload fingerprint mismatch')
    return snapshot.payload
  }
  catch { throw invalidDispatch() }
}

const invalidDispatch = () => new NonRetryableJobError('INVALID_JOB_DISPATCH', 'Queue dispatch identity is invalid.')

function assertSerializedJob(value: unknown): asserts value is SerializedJob {
  try {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Envelope must be a plain object')
    const job = value as Partial<SerializedJob>
    if ((job.version !== 1 && job.version !== 2) || typeof job.name !== 'string' || !job.name || job.name.length > 256 || !job.payload || Object.getPrototypeOf(job.payload) !== Object.prototype) throw new TypeError('Envelope fields are invalid')
    if (job.version === 2) {
      if (!job.metadata || Object.getPrototypeOf(job.metadata) !== Object.prototype) throw new TypeError('Envelope metadata is invalid')
      const keys = Object.keys(job.metadata)
      const limit = Object.prototype.hasOwnProperty.call(job.metadata, JOB_DISPATCH_METADATA_KEY) ? MAX_JOB_METADATA_KEYS + 1 : MAX_JOB_METADATA_KEYS
      if (keys.length > limit) throw new TypeError('Envelope metadata is invalid')
    }
  }
  catch { throw new TypeError('Invalid serialized job envelope') }
}

function cloneMetadata(metadata: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return cloneMetadataValue(metadata, new WeakMap(), { nodes: 0 }, 0) as Readonly<Record<string, unknown>>
}

function cloneMetadataValue(value: unknown, seen: WeakMap<object, object>, state: { nodes: number }, depth: number): unknown {
  if (!value || typeof value !== 'object') return value
  if (depth > 64 || ++state.nodes > 100_000) throw new TypeError('Invalid job metadata')
  const existing = seen.get(value)
  if (existing) return existing
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== Array.prototype) return structuredClone(value)
  const clone: Record<PropertyKey, unknown> | unknown[] = Array.isArray(value) ? [] : {}
  seen.set(value, clone)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor) throw new TypeError('Invalid job metadata')
    Object.defineProperty(clone, key, 'value' in descriptor
      ? { ...descriptor, value: cloneMetadataValue(descriptor.value, seen, state, depth + 1) }
      : descriptor)
  }
  return clone
}

import type { Resolver } from '@nuxt-laravelize/core/runtime'

const RESERVED_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export interface SerializedJobV1 {
  readonly version: 1
  readonly name: string
  readonly payload: Record<string, unknown>
}
export interface SerializedJobV2 {
  readonly version: 2
  readonly name: string
  readonly payload: Record<string, unknown>
  readonly metadata: Readonly<Record<string, unknown>>
}
export type SerializedJob = SerializedJobV1 | SerializedJobV2

export abstract class Job<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  static readonly jobName?: string
  static readonly tries: number = 1
  static readonly delay: number = 0
  static readonly queue: string = 'default'
  static readonly backoff: number | readonly number[] = 0
  static readonly priority: number = 0

  abstract readonly payload: TPayload
  abstract handle(resolver: Resolver): void | Promise<void>
  failed?(error: unknown): void | Promise<void>

  serialize(): SerializedJob {
    const constructor = this.constructor as typeof Job
    return { version: 1, name: constructor.jobName ?? constructor.name, payload: this.payload }
  }
}

export type JobMetadataContributor = (job: Job, resolver?: Resolver) => Readonly<Record<string, unknown>> | undefined
export class JobMetadataContributorRegistry {
  readonly #contributors: Array<{ readonly id?: string, readonly contributor: JobMetadataContributor }> = []
  contribute(contributor: JobMetadataContributor): void
  contribute(id: string, contributor: JobMetadataContributor): void
  contribute(idOrContributor: string | JobMetadataContributor, contributor?: JobMetadataContributor): void {
    const id = typeof idOrContributor === 'string' ? idOrContributor : undefined
    const value = typeof idOrContributor === 'string' ? contributor : idOrContributor
    if (!value || (id !== undefined && (!id || this.#contributors.some(item => item.id === id)))) throw new TypeError(`Duplicate or invalid job metadata contributor id: ${id ?? ''}`)
    this.#contributors.push({ ...(id ? { id } : {}), contributor: value })
  }

  has(id: string): boolean { return this.#contributors.some(item => item.id === id) }
  contributions(job: Job, resolver?: Resolver): Readonly<Record<string, unknown>>[] {
    return this.#contributors.map(({ contributor }) => contributor(job, resolver) ?? {})
  }
}
export class JobSerializer {
  constructor(
    private readonly contributors = new JobMetadataContributorRegistry(),
    private readonly resolver?: Resolver,
  ) {}

  contribute(contributor: JobMetadataContributor): void { this.contributors.contribute(contributor) }

  serialize(job: Job): SerializedJob {
    const metadata: Record<string, unknown> = {}
    for (const contribution of this.contributors.contributions(job, this.resolver)) {
      if (Object.getPrototypeOf(contribution) !== Object.prototype) throw new TypeError('Job metadata contribution must be a plain object')
      for (const [key, value] of Object.entries(contribution)) {
        if (RESERVED_METADATA_KEYS.has(key)) throw new TypeError(`Reserved job metadata key: ${key}`)
        if (Object.prototype.hasOwnProperty.call(metadata, key)) throw new TypeError(`Duplicate job metadata key: ${key}`)
        Object.defineProperty(metadata, key, { value, enumerable: true, configurable: true, writable: true })
      }
    }
    const constructor = job.constructor as typeof Job
    const name = constructor.jobName ?? constructor.name
    return Object.keys(metadata).length ? { version: 2, name, payload: job.payload, metadata } : job.serialize()
  }
}

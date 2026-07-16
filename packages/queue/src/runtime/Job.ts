import type { Resolver } from '@nuxt-laravelize/core/runtime'

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
  static readonly tries: number = 1
  static readonly delay: number = 0
  static readonly queue: string = 'default'
  static readonly backoff: number | readonly number[] = 0

  abstract readonly payload: TPayload
  abstract handle(resolver: Resolver): void | Promise<void>
  failed?(error: unknown): void | Promise<void>

  serialize(): SerializedJob {
    return { version: 1, name: this.constructor.name, payload: this.payload }
  }
}

export type JobMetadataContributor = (job: Job, resolver?: Resolver) => Readonly<Record<string, unknown>> | undefined
export class JobMetadataContributorRegistry {
  readonly #contributors: JobMetadataContributor[] = []
  contribute(contributor: JobMetadataContributor): void { this.#contributors.push(contributor) }
  contributions(job: Job, resolver?: Resolver): Readonly<Record<string, unknown>>[] {
    return this.#contributors.map(contributor => contributor(job, resolver) ?? {})
  }
}
export class JobSerializer {
  constructor(
    private readonly contributors = new JobMetadataContributorRegistry(),
    private readonly resolver?: Resolver,
  ) {}

  contribute(contributor: JobMetadataContributor): void { this.contributors.contribute(contributor) }

  serialize(job: Job): SerializedJob {
    const metadata = Object.assign({}, ...this.contributors.contributions(job, this.resolver)) as Record<string, unknown>
    return Object.keys(metadata).length ? { version: 2, name: job.constructor.name, payload: job.payload, metadata } : job.serialize()
  }
}

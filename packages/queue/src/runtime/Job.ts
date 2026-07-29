import type { Resolver } from '@nuxt-laravelize/core/runtime'

export const JOB_TAGS_METADATA_KEY = 'laravelize.queue.tags.v1'
export const MAX_JOB_TAGS = 16
export const MAX_JOB_TAG_LENGTH = 128
export const MAX_JOB_TAGS_LENGTH = 1024
export const MAX_JOB_METADATA_KEYS = 64

const EMPTY_JOB_TAGS: readonly string[] = Object.freeze([])
const RESERVED_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor', JOB_TAGS_METADATA_KEY])

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
  tags(): readonly string[] { return EMPTY_JOB_TAGS }

  serialize(): SerializedJob {
    return serializeJob(this, normalizeJobTags(this.tags()), [])
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
    const tags = normalizeJobTags(job.tags())
    const custom = job.serialize !== Job.prototype.serialize ? () => job.serialize() : undefined
    return serializeJob(job, tags, this.contributors.contributions(job, this.resolver), custom)
  }
}

export function readJobTags(serialized: SerializedJob): readonly string[] {
  try {
    if (serialized.version !== 2 || Object.getPrototypeOf(serialized.metadata) !== Object.prototype || !Object.prototype.hasOwnProperty.call(serialized.metadata, JOB_TAGS_METADATA_KEY)) return EMPTY_JOB_TAGS
    return normalizeJobTags(serialized.metadata[JOB_TAGS_METADATA_KEY])
  }
  catch {
    return EMPTY_JOB_TAGS
  }
}

function serializeJob(job: Job, tags: readonly string[], contributions: readonly Readonly<Record<string, unknown>>[], fallback?: () => SerializedJob): SerializedJob {
  const metadata: Record<string, unknown> = {}
  for (const contribution of contributions) {
    if (Object.getPrototypeOf(contribution) !== Object.prototype) throw new TypeError('Job metadata contribution must be a plain object')
    for (const [key, value] of Object.entries(contribution)) {
      if (RESERVED_METADATA_KEYS.has(key)) throw new TypeError(`Reserved job metadata key: ${key}`)
      if (Object.prototype.hasOwnProperty.call(metadata, key)) throw new TypeError(`Duplicate job metadata key: ${key}`)
      Object.defineProperty(metadata, key, { value, enumerable: true, configurable: true, writable: true })
    }
  }
  if (tags.length > 0) Object.defineProperty(metadata, JOB_TAGS_METADATA_KEY, { value: tags, enumerable: true, configurable: true, writable: true })
  if (Object.keys(metadata).length > MAX_JOB_METADATA_KEYS) throw new TypeError(`Job metadata must contain at most ${MAX_JOB_METADATA_KEYS} keys`)
  const constructor = job.constructor as typeof Job
  const name = constructor.jobName ?? constructor.name
  return Object.keys(metadata).length ? { version: 2, name, payload: job.payload, metadata } : fallback?.() ?? { version: 1, name, payload: job.payload }
}

function normalizeJobTags(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError('Job tags must be an array')
  if (value.length > MAX_JOB_TAGS) throw new TypeError(`Job tags must contain at most ${MAX_JOB_TAGS} entries`)
  const unique = new Set<string>()
  let totalLength = 0
  for (const tag of value) {
    if (typeof tag !== 'string' || !new RegExp(`^[A-Z0-9][\\w.:-]{0,${MAX_JOB_TAG_LENGTH - 1}}$`, 'i').test(tag)) {
      throw new TypeError(`Job tags must be safe identifiers of at most ${MAX_JOB_TAG_LENGTH} characters`)
    }
    totalLength += tag.length
    if (totalLength > MAX_JOB_TAGS_LENGTH) throw new TypeError(`Job tags must contain at most ${MAX_JOB_TAGS_LENGTH} characters in total`)
    unique.add(tag)
  }
  return unique.size === 0 ? EMPTY_JOB_TAGS : Object.freeze([...unique])
}

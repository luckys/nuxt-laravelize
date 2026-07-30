import type { Resolver } from '@nuxt-laravelize/core/runtime'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export const JOB_TAGS_METADATA_KEY = 'laravelize.queue.tags.v1'
export const JOB_DISPATCH_METADATA_KEY = 'laravelize.queue.dispatch.v1'
export const MAX_JOB_TAGS = 16
export const MAX_JOB_TAG_LENGTH = 128
export const MAX_JOB_TAGS_LENGTH = 1024
export const MAX_JOB_METADATA_KEYS = 64

const EMPTY_JOB_TAGS: readonly string[] = Object.freeze([])
const RESERVED_METADATA_KEYS = new Set(['__proto__', 'prototype', 'constructor', JOB_TAGS_METADATA_KEY, JOB_DISPATCH_METADATA_KEY])
const DISPATCH_ID = /^\w[\w.:-]{0,127}$/
const PAYLOAD_FINGERPRINT = /^sha256:[a-f0-9]{64}$/
const MAX_PAYLOAD_DEPTH = 64
const MAX_PAYLOAD_NODES = 100_000
const MAX_PAYLOAD_OBJECT_KEYS = 10_000
const MAX_CANONICAL_PAYLOAD_BYTES = 1_048_576

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
export interface JobDispatchIdentityV1 {
  readonly version: 1
  readonly id: string
  readonly payloadFingerprint: `sha256:${string}`
}
export type DispatchIdFactory = () => string

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
    private readonly dispatchIdFactory: DispatchIdFactory = () => globalThis.crypto.randomUUID(),
  ) {}

  contribute(contributor: JobMetadataContributor): void { this.contributors.contribute(contributor) }

  serialize(job: Job): SerializedJob {
    const tags = normalizeJobTags(job.tags())
    const custom = job.serialize !== Job.prototype.serialize ? () => job.serialize() : undefined
    const serialized = serializeJob(job, tags, this.contributors.contributions(job, this.resolver), custom)
    const { payload, fingerprint } = snapshotPayload(serialized.payload)
    const identity = normalizeDispatchIdentity({ version: 1, id: this.dispatchIdFactory(), payloadFingerprint: fingerprint })
    const copiedMetadata = serialized.version === 2 ? copyMetadata(serialized.metadata) : {}
    const metadata = snapshotPayload(copiedMetadata).payload
    if (Object.prototype.hasOwnProperty.call(metadata, JOB_DISPATCH_METADATA_KEY)) throw new TypeError(`Reserved job metadata key: ${JOB_DISPATCH_METADATA_KEY}`)
    if (Object.keys(metadata).length > MAX_JOB_METADATA_KEYS) throw new TypeError(`Job metadata must contain at most ${MAX_JOB_METADATA_KEYS} keys`)
    Object.defineProperty(metadata, JOB_DISPATCH_METADATA_KEY, { value: identity, enumerable: true, configurable: true, writable: true })
    return { version: 2, name: serialized.name, payload, metadata }
  }
}

export function fingerprintJobPayload(payload: Record<string, unknown>): `sha256:${string}` {
  return snapshotPayload(payload).fingerprint
}

export function snapshotJobPayload(payload: Record<string, unknown>): { readonly payload: Record<string, unknown>, readonly fingerprint: `sha256:${string}` } {
  return snapshotPayload(payload)
}

export function readJobDispatchIdentity(serialized: SerializedJob): JobDispatchIdentityV1 | undefined {
  if (serialized.version !== 2 || !Object.prototype.hasOwnProperty.call(serialized.metadata, JOB_DISPATCH_METADATA_KEY)) return undefined
  return normalizeDispatchIdentity(serialized.metadata[JOB_DISPATCH_METADATA_KEY])
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

function copyMetadata(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Job metadata must be a plain object')
  const metadata: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (typeof key !== 'string' || !descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Job metadata must contain enumerable data properties')
    Object.defineProperty(metadata, key, { value: descriptor.value, enumerable: true, configurable: true, writable: true })
  }
  return metadata
}

function normalizeDispatchIdentity(value: unknown): JobDispatchIdentityV1 {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 3) throw new TypeError('Invalid job dispatch identity')
  const version = Object.getOwnPropertyDescriptor(value, 'version')
  const id = Object.getOwnPropertyDescriptor(value, 'id')
  const fingerprint = Object.getOwnPropertyDescriptor(value, 'payloadFingerprint')
  const data = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => Boolean(descriptor && 'value' in descriptor && descriptor.enumerable)
  if (!data(version) || version.value !== 1 || !data(id) || typeof id.value !== 'string' || !DISPATCH_ID.test(id.value) || !data(fingerprint) || typeof fingerprint.value !== 'string' || !PAYLOAD_FINGERPRINT.test(fingerprint.value)) throw new TypeError('Invalid job dispatch identity')
  return Object.freeze({ version: 1, id: id.value, payloadFingerprint: fingerprint.value as `sha256:${string}` })
}

function snapshotPayload(payload: Record<string, unknown>): { readonly payload: Record<string, unknown>, readonly fingerprint: `sha256:${string}` } {
  try {
    if (!payload || typeof payload !== 'object' || Object.getPrototypeOf(payload) !== Object.prototype) throw new TypeError('Invalid job payload')
    const state: CanonicalPayloadState = { nodes: 0, bytes: 0, chunks: [] }
    writeCanonicalPayload(payload, new Set(), state, 0)
    const canonical = state.chunks.join('')
    const bytes = new TextEncoder().encode(canonical)
    const domain = new TextEncoder().encode('nuxt-laravelize:queue-payload:v1\0')
    const input = new Uint8Array(domain.byteLength + bytes.byteLength)
    input.set(domain)
    input.set(bytes, input.byteLength - bytes.byteLength)
    const fingerprint = `sha256:${bytesToHex(sha256(input))}` as const
    return { payload: JSON.parse(canonical) as Record<string, unknown>, fingerprint }
  }
  catch (error) {
    if (error instanceof TypeError && error.message === 'Invalid job payload') throw error
    throw new TypeError('Invalid job payload', { cause: error })
  }
}

interface CanonicalPayloadState { nodes: number, bytes: number, chunks: string[] }

function writeCanonicalPayload(value: unknown, stack: Set<object>, state: CanonicalPayloadState, depth: number): void {
  if (depth > MAX_PAYLOAD_DEPTH || ++state.nodes > MAX_PAYLOAD_NODES) throw new TypeError('Invalid job payload')
  if (value === null || typeof value === 'boolean') {
    appendCanonical(state, JSON.stringify(value))
    return
  }
  if (typeof value === 'string') {
    appendCanonicalString(state, value)
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Invalid job payload')
    appendCanonical(state, JSON.stringify(value))
    return
  }
  if (!value || typeof value !== 'object' || stack.has(value)) throw new TypeError('Invalid job payload')
  stack.add(value)
  try {
    if (Array.isArray(value)) {
      const minimumBytes = value.length > 0 ? value.length * 2 + 1 : 2
      if (value.length > MAX_PAYLOAD_NODES - state.nodes || state.bytes + minimumBytes > MAX_CANONICAL_PAYLOAD_BYTES) throw new TypeError('Invalid job payload')
      if (Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('Invalid job payload')
      appendCanonical(state, '[')
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Invalid job payload')
        if (index > 0) appendCanonical(state, ',')
        writeCanonicalPayload(descriptor.value, stack, state, depth + 1)
      }
      appendCanonical(state, ']')
      return
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid job payload')
    const keys: string[] = []
    let minimumBytes = 0
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue
      keys.push(key)
      if (keys.length > MAX_PAYLOAD_OBJECT_KEYS || keys.length > MAX_PAYLOAD_NODES - state.nodes) throw new TypeError('Invalid job payload')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Invalid job payload')
      minimumBytes += jsonStringBytes(key) + (keys.length > 1 ? 3 : 2)
      if (state.bytes + minimumBytes + 2 > MAX_CANONICAL_PAYLOAD_BYTES) throw new TypeError('Invalid job payload')
    }
    if (Reflect.ownKeys(value).length !== keys.length) throw new TypeError('Invalid job payload')
    appendCanonical(state, '{')
    for (const [index, key] of keys.sort().entries()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new TypeError('Invalid job payload')
      if (index > 0) appendCanonical(state, ',')
      appendCanonicalString(state, key)
      appendCanonical(state, ':')
      writeCanonicalPayload(descriptor.value, stack, state, depth + 1)
    }
    appendCanonical(state, '}')
  }
  finally { stack.delete(value) }
}

function appendCanonical(state: CanonicalPayloadState, value: string, bytes = value.length): void {
  state.bytes += bytes
  if (state.bytes > MAX_CANONICAL_PAYLOAD_BYTES) throw new TypeError('Invalid job payload')
  state.chunks.push(value)
}

function appendCanonicalString(state: CanonicalPayloadState, value: string): void {
  const bytes = jsonStringBytes(value)
  if (state.bytes + bytes > MAX_CANONICAL_PAYLOAD_BYTES) throw new TypeError('Invalid job payload')
  appendCanonical(state, JSON.stringify(value), bytes)
}

function jsonStringBytes(value: string): number {
  let bytes = 2
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code === 0x22 || code === 0x5C || code === 0x08 || code === 0x09 || code === 0x0A || code === 0x0C || code === 0x0D) bytes += 2
    else if (code < 0x20 || (code >= 0xD800 && code <= 0xDFFF && !(code <= 0xDBFF && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xDC00 && value.charCodeAt(index + 1) <= 0xDFFF))) bytes += 6
    else if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xD800 && code <= 0xDBFF) {
      bytes += 4
      index += 1
    }
    else bytes += 3
    if (bytes > MAX_CANONICAL_PAYLOAD_BYTES) return bytes
  }
  return bytes
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

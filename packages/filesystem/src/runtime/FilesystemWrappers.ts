import type { FileContents, Filesystem } from './Filesystem'
import type {
  ChecksumFilesystem,
  DirectUploadFilesystem,
  DirectUploadPolicy,
  MultipartFilesystem,
  StreamFilesystem,
  TemporaryUrlFilesystem,
  UploadConfirmationFilesystem,
  VisibilityFilesystem,
} from './AdvancedFilesystem'
import {
  FilesystemCapabilityError,
  createDirectUploadPolicy,
  isChecksumFilesystem,
  isDirectUploadFilesystem,
  isMultipartFilesystem,
  isStreamFilesystem,
  isTemporaryUrlFilesystem,
  isUploadConfirmationFilesystem,
  isVisibilityFilesystem,
} from './AdvancedFilesystem'
import { FileNotFoundError } from './Filesystem'
import { normalizeStoragePath } from './paths'

type ExtendedFilesystem = Filesystem & Partial<TemporaryUrlFilesystem & DirectUploadFilesystem & UploadConfirmationFilesystem & VisibilityFilesystem & ChecksumFilesystem & StreamFilesystem & MultipartFilesystem>

export function scopedFilesystem(base: Filesystem, prefix: string): Filesystem {
  const scope = strictPath(prefix)
  const path = (value: string, allowEmpty = false) => {
    const normalized = strictPath(value, allowEmpty)
    return normalized ? `${scope}/${normalized}` : scope
  }
  const unpath = (value: string) => {
    if (value !== scope && !value.startsWith(`${scope}/`)) throw new Error('Filesystem result escaped its scoped disk.')
    return value === scope ? '' : value.slice(scope.length + 1)
  }
  const disk: ExtendedFilesystem = {
    write: (value, contents) => base.write(path(value), contents),
    read: value => base.read(path(value)),
    readText: value => base.readText(path(value)),
    exists: value => base.exists(path(value)),
    delete: value => base.delete(path(value)),
    copy: (from, to) => base.copy(path(from), path(to)),
    move: (from, to) => base.move(path(from), path(to)),
    list: async (value = '') => (await base.list(path(value, true))).filter(item => item === scope || item.startsWith(`${scope}/`)).map(unpath).filter(Boolean),
    size: value => base.size(path(value)),
  }
  if (isTemporaryUrlFilesystem(base)) disk.temporaryUrl = (value, options) => base.temporaryUrl(path(value), options)
  if (isChecksumFilesystem(base)) disk.checksum = (value, algorithm) => base.checksum(path(value), algorithm)
  if (isStreamFilesystem(base)) {
    disk.readStream = value => base.readStream(path(value))
    disk.writeStream = (value, contents) => base.writeStream(path(value), contents)
  }
  if (isVisibilityFilesystem(base)) {
    disk.visibility = value => base.visibility(path(value))
    disk.setVisibility = (value, visibility) => base.setVisibility(path(value), visibility)
  }
  if (isDirectUploadFilesystem(base)) disk.createDirectUpload = async (request) => {
    const scoped = scopePolicy(request.policy, scope)
    const grant = await base.createDirectUpload({ ...request, policy: scoped, confirmationAudience: scopeAudience(scope, request.confirmationAudience) })
    return { ...grant, policy: request.policy }
  }
  if (isUploadConfirmationFilesystem(base)) disk.confirmUpload = async (grant, context) => {
    const confirmed = await base.confirmUpload({ ...grant, policy: scopePolicy(grant.policy, scope) }, { audience: scopeAudience(scope, context?.audience) })
    return { ...confirmed, path: unpath(confirmed.path) }
  }
  if (isMultipartFilesystem(base)) {
    disk.startMultipart = async (value, options) => ({ ...await base.startMultipart(path(value), options), path: strictPath(value) })
    disk.uploadPart = (upload, part, contents) => base.uploadPart({ ...upload, path: path(upload.path) }, part, contents)
    disk.completeMultipart = (upload, parts) => base.completeMultipart({ ...upload, path: path(upload.path) }, parts)
    disk.abortMultipart = upload => base.abortMultipart({ ...upload, path: path(upload.path) })
  }
  return disk
}

export function readOnlyFilesystem(base: Filesystem): Filesystem {
  const denied = (capability: string) => async () => {
    throw new FilesystemCapabilityError(capability)
  }
  const disk: ExtendedFilesystem = {
    write: denied('write'),
    read: path => base.read(path),
    readText: path => base.readText(path),
    exists: path => base.exists(path),
    delete: denied('delete'),
    copy: denied('copy'),
    move: denied('move'),
    list: prefix => base.list(prefix),
    size: path => base.size(path),
  }
  if (isTemporaryUrlFilesystem(base)) disk.temporaryUrl = (path, options) => base.temporaryUrl(path, options)
  if (isChecksumFilesystem(base)) disk.checksum = (path, algorithm) => base.checksum(path, algorithm)
  if (isStreamFilesystem(base)) disk.readStream = path => base.readStream(path)
  return disk
}

export class ReadFallbackFilesystem implements Filesystem {
  readonly #primary: Filesystem
  readonly #fallback: Filesystem
  readonly #tombstones: FilesystemTombstoneStore

  constructor(primary: Filesystem, fallback: Filesystem, tombstones: FilesystemTombstoneStore) {
    if (!tombstones) throw new Error('ReadFallbackFilesystem requires an explicit tombstone store.')
    this.#primary = primary
    this.#fallback = fallback
    this.#tombstones = tombstones
  }

  async write(path: string, contents: FileContents): Promise<void> {
    await this.#primary.write(normalizeStoragePath(path), contents)
  }

  async read(path: string): Promise<Uint8Array> {
    const normalized = normalizeStoragePath(path)
    return await this.#fallbackOnMissing(normalized, disk => disk.read(normalized))
  }

  async readText(path: string): Promise<string> {
    const normalized = normalizeStoragePath(path)
    return await this.#fallbackOnMissing(normalized, disk => disk.readText(normalized))
  }

  async exists(path: string): Promise<boolean> {
    const normalized = normalizeStoragePath(path)
    if (await this.#primary.exists(normalized)) return true
    if (await this.#tombstones.has(normalized)) return false
    const exists = await this.#fallback.exists(normalized)
    if (await this.#primary.exists(normalized)) return true
    return exists && !await this.#tombstones.has(normalized)
  }

  async delete(path: string): Promise<boolean> {
    const normalized = normalizeStoragePath(path)
    const existed = await this.#primary.exists(normalized)
      || (!await this.#tombstones.has(normalized) && await this.#fallback.exists(normalized))
    await this.#tombstones.record(normalized)
    await this.#primary.delete(normalized)
    return existed
  }

  async copy(from: string, to: string): Promise<void> {
    const source = normalizeStoragePath(from)
    const target = normalizeStoragePath(to)
    await this.#primary.copy(source, target)
  }

  async move(from: string, to: string): Promise<void> {
    const source = normalizeStoragePath(from)
    const target = normalizeStoragePath(to)
    if (source === target) {
      await this.#primary.move(source, target)
      return
    }
    await this.#primary.copy(source, target)
    await this.#tombstones.record(source)
    await this.#primary.delete(source)
  }

  async list(prefix?: string): Promise<string[]> {
    const primary = await this.#primary.list(prefix)
    const primaryPaths = new Set(primary)
    const visible: string[] = []
    for (const path of [...new Set([...primary, ...await this.#fallback.list(prefix)])].sort()) {
      if (primaryPaths.has(path) || !await this.#tombstones.has(path)) visible.push(path)
    }
    return visible
  }

  async size(path: string): Promise<number> {
    const normalized = normalizeStoragePath(path)
    return await this.#fallbackOnMissing(normalized, disk => disk.size(normalized))
  }

  async #fallbackOnMissing<T>(path: string, operation: (disk: Filesystem) => Promise<T>): Promise<T> {
    try {
      return await operation(this.#primary)
    }
    catch (error) {
      if (!(error instanceof FileNotFoundError)) throw error
      if (await this.#tombstones.has(path)) throw error
      const result = await operation(this.#fallback)
      if (await this.#tombstones.has(path)) throw error
      try {
        return await operation(this.#primary)
      }
      catch (replacementError) {
        if (!(replacementError instanceof FileNotFoundError)) throw replacementError
        if (await this.#tombstones.has(path)) throw error
        return result
      }
    }
  }
}

export interface FilesystemTombstoneStore {
  /** Reads durable authoritative deletion history for one normalized logical path. */
  has(path: string): Promise<boolean>
  /** Idempotently and durably records a tombstone; runtime code never clears it. */
  record(path: string): Promise<void>
}

/** Process-local tombstones for tests and development only. */
export class InMemoryFilesystemTombstoneStore implements FilesystemTombstoneStore {
  readonly #paths = new Set<string>()

  async has(path: string): Promise<boolean> {
    return this.#paths.has(normalizeStoragePath(path))
  }

  async record(path: string): Promise<void> {
    this.#paths.add(normalizeStoragePath(path))
  }
}

export interface Quarantine {
  readonly disk: Filesystem
  release(evidence: QuarantineReleaseEvidence, destination: Filesystem, destinationPath?: string): Promise<void>
  reject(path: string): Promise<boolean>
}

export interface QuarantineReleaseEvidence {
  readonly accepted: true
  readonly path: string
  readonly checksum: {
    readonly algorithm: 'sha256'
    readonly value: string
  }
}

export function quarantineFilesystem(base: Filesystem, prefix = 'quarantine'): Quarantine {
  const disk = scopedFilesystem(base, prefix)
  return Object.freeze({
    disk,
    async release(evidence: QuarantineReleaseEvidence, destination: Filesystem, destinationPath?: string) {
      if (!evidence || evidence.accepted !== true) throw new Error('Quarantine release requires accepted scan evidence.')
      const source = strictPath(evidence.path)
      const target = strictPath(destinationPath ?? source)
      const expected = decodeSha256(evidence.checksum)
      const snapshot = Uint8Array.from(await disk.read(source))
      const actual = await sha256(snapshot)
      if (!constantTimeEqual(actual, expected)) throw new Error('Quarantine release checksum does not match the accepted scan evidence.')
      await destination.write(target, snapshot)
    },
    reject: (path: string) => disk.delete(strictPath(path)),
  })
}

async function sha256(contents: Uint8Array): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable.')
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(contents).buffer))
}

function decodeSha256(checksum: QuarantineReleaseEvidence['checksum'] | undefined): Uint8Array {
  if (!checksum || checksum.algorithm !== 'sha256' || !/^[a-f\d]{64}$/i.test(checksum.value)) {
    throw new Error('Quarantine release evidence requires an exact SHA-256 hex digest.')
  }
  return Uint8Array.from(checksum.value.match(/.{2}/g)!, pair => Number.parseInt(pair, 16))
}

function constantTimeEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  let difference = actual.byteLength ^ expected.byteLength
  const length = Math.max(actual.byteLength, expected.byteLength)
  for (let index = 0; index < length; index++) difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0)
  return difference === 0
}

function scopePolicy(policy: DirectUploadPolicy, scope: string): DirectUploadPolicy {
  return createDirectUploadPolicy({
    ...policy,
    path: `${scope}/${policy.path}`,
    keyPrefix: `${scope}/${policy.keyPrefix}`,
  })
}

function scopeAudience(scope: string, audience?: string): string {
  return audience ? `${scope}/${audience}` : scope
}

function strictPath(path: string, allowEmpty = false): string {
  const normalized = normalizeStoragePath(path, allowEmpty)
  if (path !== normalized) throw new Error('Filesystem path must already be normalized and relative.')
  return normalized
}

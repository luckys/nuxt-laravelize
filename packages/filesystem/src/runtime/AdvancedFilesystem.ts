import type { FileContents, Filesystem } from './Filesystem'
import { normalizeStoragePath } from './paths'

export const MAX_TEMPORARY_URL_TTL_SECONDS = 7 * 24 * 60 * 60

export type FileVisibility = 'private' | 'public'
export type ChecksumAlgorithm = 'sha256'
export type FilesystemStream = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>

export interface TemporaryUrlOptions {
  readonly expiresAt: Date
  readonly downloadName?: string
  readonly contentType?: string
}

export interface TemporaryUrlFilesystem {
  temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string>
}

export interface DirectUploadChecksum {
  readonly algorithm: ChecksumAlgorithm
  readonly value: string
}

export interface DirectUploadPolicy {
  readonly path: string
  readonly keyPrefix: string
  readonly maxBytes: number
  readonly mimeTypes: readonly string[]
  readonly checksum?: DirectUploadChecksum
  readonly actorId: string
  readonly tenantId: string
  readonly expiresAt: string
}

export interface DirectUploadPolicyInput extends Omit<DirectUploadPolicy, 'mimeTypes' | 'checksum'> {
  readonly mimeTypes: readonly string[]
  readonly checksum?: DirectUploadChecksum
}

export interface DirectUploadRequest {
  readonly policy: DirectUploadPolicy
  readonly mimeType: string
  /** Adapter/wrapper-owned confirmation audience. Do not populate from client input. */
  readonly confirmationAudience?: string
}

export interface DirectUploadGrant {
  readonly id: string
  readonly url: string
  readonly method: 'POST'
  readonly fields: Readonly<Record<string, string>>
  readonly mimeType: string
  readonly policy: DirectUploadPolicy
}

export interface DirectUploadFilesystem {
  createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadGrant>
}

export interface ConfirmedUpload {
  readonly path: string
  readonly bytes: number
  readonly mimeType: string
  readonly checksum?: DirectUploadChecksum
  readonly actorId: string
  readonly tenantId: string
}

export interface UploadConfirmationFilesystem {
  confirmUpload(grant: DirectUploadGrant, context?: { readonly audience?: string }): Promise<ConfirmedUpload>
}

export interface VisibilityFilesystem {
  visibility(path: string): Promise<FileVisibility>
  setVisibility(path: string, visibility: FileVisibility): Promise<void>
}

export interface ChecksumFilesystem {
  checksum(path: string, algorithm?: ChecksumAlgorithm): Promise<DirectUploadChecksum>
}

export interface StreamFilesystem {
  readStream(path: string): Promise<ReadableStream<Uint8Array>>
  writeStream(path: string, contents: FilesystemStream): Promise<void>
}

export interface MultipartUpload {
  readonly uploadId: string
  readonly path: string
}

export interface MultipartPart {
  readonly partNumber: number
  readonly etag: string
}

export interface MultipartFilesystem {
  startMultipart(path: string, options?: { readonly mimeType?: string }): Promise<MultipartUpload>
  uploadPart(upload: MultipartUpload, partNumber: number, contents: FileContents | FilesystemStream): Promise<MultipartPart>
  completeMultipart(upload: MultipartUpload, parts: readonly MultipartPart[]): Promise<void>
  abortMultipart(upload: MultipartUpload): Promise<void>
}

export class FilesystemCapabilityError extends Error {
  constructor(readonly capability: string) {
    super(`Filesystem capability is not available: ${capability}.`)
    this.name = 'FilesystemCapabilityError'
  }
}

export function createDirectUploadPolicy(input: DirectUploadPolicyInput, now = new Date()): DirectUploadPolicy {
  const path = strictPath(input.path)
  const keyPrefix = strictPath(input.keyPrefix)
  if (path.length > 1024 || keyPrefix.length > 1024) throw new Error('Direct upload paths cannot exceed 1024 characters.')
  if (path !== keyPrefix && !path.startsWith(`${keyPrefix}/`)) throw new Error('Direct upload path must be within keyPrefix.')
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) throw new Error('Direct upload maxBytes must be a positive safe integer.')
  if (!input.mimeTypes.length || input.mimeTypes.length > 32) throw new Error('Direct upload policy requires 1 to 32 MIME types.')
  const mimeTypes = [...new Set(input.mimeTypes.map(validateMimeType))].sort()
  const actorId = boundedIdentifier(input.actorId, 'actorId')
  const tenantId = boundedIdentifier(input.tenantId, 'tenantId')
  const expires = new Date(input.expiresAt)
  const ttl = expires.getTime() - now.getTime()
  if (!Number.isFinite(expires.getTime()) || ttl <= 0) throw new Error('Direct upload expiry must be in the future.')
  if (ttl > MAX_TEMPORARY_URL_TTL_SECONDS * 1000) throw new Error('Direct upload expiry cannot exceed seven days.')
  const checksum = input.checksum && Object.freeze(validateChecksum(input.checksum))
  return Object.freeze({
    path,
    keyPrefix,
    maxBytes: input.maxBytes,
    mimeTypes: Object.freeze(mimeTypes),
    ...(checksum ? { checksum } : {}),
    actorId,
    tenantId,
    expiresAt: expires.toISOString(),
  })
}

export function assertUsableUploadPolicy(policy: DirectUploadPolicy, now = new Date()): void {
  createDirectUploadPolicy(policy, now)
}

export function temporaryUrlExpiresIn(expiresAt: Date, now = new Date()): number {
  const seconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
  if (!Number.isFinite(expiresAt.getTime()) || seconds <= 0) throw new Error('Temporary URL expiry must be in the future.')
  if (seconds > MAX_TEMPORARY_URL_TTL_SECONDS) throw new Error('Temporary URL expiry cannot exceed seven days.')
  return seconds
}

export const isTemporaryUrlFilesystem = (disk: unknown): disk is Filesystem & TemporaryUrlFilesystem => hasMethods(disk, ['temporaryUrl'])
export const isDirectUploadFilesystem = (disk: unknown): disk is Filesystem & DirectUploadFilesystem => hasMethods(disk, ['createDirectUpload'])
export const isUploadConfirmationFilesystem = (disk: unknown): disk is Filesystem & UploadConfirmationFilesystem => hasMethods(disk, ['confirmUpload'])
export const isVisibilityFilesystem = (disk: unknown): disk is Filesystem & VisibilityFilesystem => hasMethods(disk, ['visibility', 'setVisibility'])
export const isChecksumFilesystem = (disk: unknown): disk is Filesystem & ChecksumFilesystem => hasMethods(disk, ['checksum'])
export const isStreamFilesystem = (disk: unknown): disk is Filesystem & StreamFilesystem => hasMethods(disk, ['readStream', 'writeStream'])
export const isMultipartFilesystem = (disk: unknown): disk is Filesystem & MultipartFilesystem => hasMethods(disk, ['startMultipart', 'uploadPart', 'completeMultipart', 'abortMultipart'])

function strictPath(path: string, allowEmpty = false): string {
  if (/^[a-z]:\//i.test(path)) throw new Error('Filesystem path must be relative.')
  const normalized = normalizeStoragePath(path, allowEmpty)
  if (normalized !== path) throw new Error('Filesystem path must already be normalized and relative.')
  return normalized
}

function validateMimeType(value: string): string {
  if (value.length > 255 || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(value)) throw new Error(`Invalid MIME type: "${value}".`)
  return value.toLowerCase()
}

function validateChecksum(checksum: DirectUploadChecksum): DirectUploadChecksum {
  if (checksum.algorithm !== 'sha256' || !/^[a-f\d]{64}$/i.test(checksum.value)) throw new Error('Direct upload checksum must be a SHA-256 hex digest.')
  return { algorithm: 'sha256', value: checksum.value.toLowerCase() }
}

function boundedIdentifier(value: string, name: string): string {
  if (!value || value.length > 255 || !/^[\x20-\x7E]+$/.test(value)) throw new Error(`Direct upload ${name} must contain 1 to 255 safe ASCII characters.`)
  return value
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  return typeof value === 'object' && value !== null && methods.every(method => typeof (value as Record<string, unknown>)[method] === 'function')
}

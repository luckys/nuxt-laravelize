import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectAclCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectAclCommand, PutObjectCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3'
import type { S3ClientConfig } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { DirectUploadGrant, DirectUploadPolicy, DirectUploadRequest, FileContents, Filesystem, FilesystemStream, MultipartPart, MultipartUpload, TemporaryUrlOptions } from '@luckys_luis/nuxt-laravelize-filesystem/runtime'
import { FileNotFoundError, assertUsableUploadPolicy, normalizeStoragePath, temporaryUrlExpiresIn, toBytes } from '@luckys_luis/nuxt-laravelize-filesystem/runtime'

export interface S3CommandClient { send(command: unknown): Promise<unknown> }
export interface S3RequestSigner { sign(command: unknown, expiresIn: number): Promise<string> }
export interface S3PresignedPostInput { Bucket: string, Key: string, Conditions: unknown[], Fields: Record<string, string>, Expires: number }
export interface S3PostSigner { create(input: S3PresignedPostInput): Promise<{ url: string, fields: Record<string, string> }> }
export interface S3UploadIssuance { readonly id: string, readonly audience: string, readonly mimeType: string, readonly policy: DirectUploadPolicy }
export interface S3UploadReservation { readonly id: string, readonly token: string, readonly issuance: S3UploadIssuance }
export interface S3UploadIssuanceStore {
  save(issuance: S3UploadIssuance): Promise<void>
  /** Atomically reserves a pending issuance for its exact trusted audience. */
  reserve(id: string, audience: string): Promise<S3UploadReservation | null>
  /** Releases a matching reservation for retry, unless it has expired. */
  release(reservation: S3UploadReservation): Promise<void>
  /** Atomically makes a matching reservation terminal and non-replayable. */
  complete(reservation: S3UploadReservation): Promise<void>
}
export interface AwsS3FilesystemOptions { bucket: string, prefix?: string, client: S3CommandClient, signer?: S3RequestSigner, postSigner?: S3PostSigner, issuanceStore?: S3UploadIssuanceStore, maxListObjects?: number }
export interface CreateAwsS3FilesystemConfig extends Omit<S3ClientConfig, 'region'> { bucket: string, prefix?: string, region: NonNullable<S3ClientConfig['region']>, issuanceStore?: S3UploadIssuanceStore, maxListObjects?: number }

interface GetResult { Body?: Uint8Array | ReadableStream<Uint8Array> | { transformToByteArray(): Promise<Uint8Array>, transformToWebStream?(): ReadableStream<Uint8Array> } }
interface HeadResult { ContentLength?: number, ContentType?: string, ChecksumSHA256?: string, Metadata?: Record<string, string> }
interface ListResult { Contents?: Array<{ Key?: string }>, IsTruncated?: boolean, NextContinuationToken?: string }

export class AwsS3Filesystem implements Filesystem {
  readonly #prefix: string
  readonly #maxListObjects: number
  readonly #issuanceStore: S3UploadIssuanceStore
  readonly temporaryUrl?: (path: string, options: TemporaryUrlOptions) => Promise<string>
  readonly createDirectUpload?: (request: DirectUploadRequest) => Promise<DirectUploadGrant>

  constructor(readonly options: AwsS3FilesystemOptions) {
    if (!options.bucket.trim()) throw new Error('S3 bucket cannot be empty.')
    this.#prefix = strictPath(options.prefix ?? '', true)
    this.#maxListObjects = positiveInteger(options.maxListObjects ?? 100_000)
    this.#issuanceStore = options.issuanceStore ?? new InMemoryS3UploadIssuanceStore()
    if (options.signer || options.client instanceof S3Client) this.temporaryUrl = (path, temporaryOptions) => this.#temporaryUrl(path, temporaryOptions)
    if (options.postSigner || options.client instanceof S3Client) this.createDirectUpload = request => this.#createDirectUpload(request)
  }

  async write(path: string, contents: FileContents): Promise<void> {
    await this.options.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: this.#key(path), Body: toBytes(contents) }))
  }

  async read(path: string): Promise<Uint8Array> {
    const normalized = strictPath(path)
    try {
      const result = await this.options.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: this.#key(normalized) })) as GetResult
      if (!result.Body) throw new FileNotFoundError(normalized)
      if (result.Body instanceof Uint8Array) return result.Body.slice()
      if ('transformToByteArray' in result.Body) return new Uint8Array(await result.Body.transformToByteArray())
      return await streamToBytes(result.Body)
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalized)
      throw error
    }
  }

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.read(path))
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.#head(path)
      return true
    }
    catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async delete(path: string): Promise<boolean> {
    if (!await this.exists(path)) return false
    await this.options.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.#key(path) }))
    return true
  }

  async copy(from: string, to: string): Promise<void> {
    const source = strictPath(from)
    try {
      await this.options.client.send(new CopyObjectCommand({ Bucket: this.options.bucket, Key: this.#key(to), CopySource: encodeCopySource(this.options.bucket, this.#key(source)) }))
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(source)
      throw error
    }
  }

  async move(from: string, to: string): Promise<void> {
    const source = strictPath(from)
    const target = strictPath(to)
    if (source === target) {
      try {
        await this.#head(source)
        return
      }
      catch (error) {
        if (isMissing(error)) throw new FileNotFoundError(source)
        throw error
      }
    }
    await this.copy(source, target)
    await this.options.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: this.#key(source) }))
  }

  async list(prefix = ''): Promise<string[]> {
    const normalized = strictPath(prefix, true)
    const files: string[] = []
    let token: string | undefined
    do {
      const page = await this.options.client.send(new ListObjectsV2Command({ Bucket: this.options.bucket, Prefix: this.#key(normalized, true), ContinuationToken: token })) as ListResult
      for (const item of page.Contents ?? []) {
        if (!item.Key) continue
        const path = this.#unkey(item.Key)
        if (path !== null && (!normalized || path === normalized || path.startsWith(`${normalized}/`))) files.push(path)
        if (files.length > this.#maxListObjects) throw new Error(`S3 listing exceeded maxListObjects (${this.#maxListObjects}).`)
      }
      if (!page.IsTruncated) break
      if (!page.NextContinuationToken || page.NextContinuationToken === token) throw new Error('S3 returned a truncated listing without a progressing continuation token.')
      token = page.NextContinuationToken
    } while (token)
    return files.sort()
  }

  async size(path: string): Promise<number> {
    const normalized = strictPath(path)
    try {
      const result = await this.#head(normalized)
      if (result.ContentLength === undefined) throw new Error('S3 HeadObject response omitted ContentLength.')
      return result.ContentLength
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalized)
      throw error
    }
  }

  async #temporaryUrl(path: string, options: TemporaryUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.options.bucket,
      Key: this.#key(path),
      ...(options.downloadName ? { ResponseContentDisposition: contentDisposition(options.downloadName) } : {}),
      ...(options.contentType ? { ResponseContentType: safeHeader(options.contentType, 'contentType') } : {}),
    })
    return await this.#sign(command, temporaryUrlExpiresIn(options.expiresAt))
  }

  async #createDirectUpload(request: DirectUploadRequest): Promise<DirectUploadGrant> {
    assertUsableUploadPolicy(request.policy)
    if (!request.policy.mimeTypes.includes(request.mimeType)) throw new Error('Direct upload MIME type is not allowed by the policy.')
    if (!request.policy.checksum) throw new Error('S3 direct uploads require an exact SHA-256 checksum.')
    const checksum = hexToBase64(request.policy.checksum.value)
    const key = this.#key(request.policy.path)
    const fields = {
      key,
      'Content-Type': request.mimeType,
      'x-amz-meta-actorid': request.policy.actorId,
      'x-amz-meta-tenantid': request.policy.tenantId,
      'x-amz-checksum-sha256': checksum,
    }
    const conditions: unknown[] = [
      ['content-length-range', 0, request.policy.maxBytes],
      ['eq', '$key', key],
      ['eq', '$Content-Type', request.mimeType],
      ['eq', '$x-amz-meta-actorid', request.policy.actorId],
      ['eq', '$x-amz-meta-tenantid', request.policy.tenantId],
    ]
    conditions.push(['eq', '$x-amz-checksum-sha256', checksum])
    const input = {
      Bucket: this.options.bucket,
      Key: key,
      Conditions: conditions,
      Fields: fields,
      Expires: secondsUntil(request.policy.expiresAt),
    }
    const result = await this.#createPost(input)
    const issuance = Object.freeze({ id: globalThis.crypto.randomUUID(), audience: request.confirmationAudience ?? '', mimeType: request.mimeType, policy: request.policy })
    await this.#issuanceStore.save(issuance)
    return Object.freeze({ id: issuance.id, url: result.url, method: 'POST', fields: Object.freeze({ ...result.fields }), mimeType: request.mimeType, policy: request.policy })
  }

  async confirmUpload(grant: DirectUploadGrant, context: { readonly audience?: string } = {}) {
    const reservation = await this.#issuanceStore.reserve(grant.id, context.audience ?? '')
    if (!reservation) throw new Error('Direct upload grant was not issued for this scope, was already confirmed, or expired.')
    try {
      const { issuance } = reservation
      const { policy } = issuance
      assertUsableUploadPolicy(policy)
      if (!policy.checksum) throw new Error('S3 direct uploads require an exact SHA-256 checksum.')
      if (!policy.mimeTypes.includes(issuance.mimeType)) throw new Error('Direct upload grant MIME type is not allowed by its policy.')
      const result = await this.#head(policy.path, true)
      if (result.ContentLength === undefined || result.ContentLength > policy.maxBytes) throw new Error('Uploaded object exceeds the policy maximum bytes.')
      if (!result.ContentType || result.ContentType.toLowerCase() !== issuance.mimeType) throw new Error('Uploaded object MIME type does not match its grant.')
      if (result.Metadata?.actorid !== policy.actorId || result.Metadata?.tenantid !== policy.tenantId) throw new Error('Uploaded object actor or tenant metadata does not match its policy.')
      if (result.ChecksumSHA256 !== hexToBase64(policy.checksum.value)) throw new Error('Uploaded object checksum does not match its policy.')
      await this.#issuanceStore.complete(reservation)
      return Object.freeze({ path: policy.path, bytes: result.ContentLength, mimeType: result.ContentType, checksum: policy.checksum, actorId: policy.actorId, tenantId: policy.tenantId })
    }
    catch (error) {
      try {
        await this.#issuanceStore.release(reservation)
      }
      catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Upload confirmation failed and its reservation could not be released.', { cause: releaseError })
      }
      throw error
    }
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const normalized = strictPath(path)
    try {
      const result = await this.options.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: this.#key(normalized) })) as GetResult
      if (!result.Body) throw new FileNotFoundError(normalized)
      if (result.Body instanceof ReadableStream) return result.Body
      if (!(result.Body instanceof Uint8Array) && result.Body.transformToWebStream) return result.Body.transformToWebStream()
      const bytes = result.Body instanceof Uint8Array ? result.Body : new Uint8Array(await result.Body.transformToByteArray())
      return new ReadableStream({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      })
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalized)
      throw error
    }
  }

  async writeStream(path: string, contents: FilesystemStream): Promise<void> {
    await this.options.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: this.#key(path), Body: contents as never }))
  }

  async visibility(path: string): Promise<'private' | 'public'> {
    const result = await this.options.client.send(new GetObjectAclCommand({ Bucket: this.options.bucket, Key: this.#key(path) })) as { Grants?: Array<{ Grantee?: { URI?: string }, Permission?: string }> }
    return result.Grants?.some(grant => grant.Permission === 'READ' && grant.Grantee?.URI?.endsWith('/AllUsers')) ? 'public' : 'private'
  }

  async setVisibility(path: string, visibility: 'private' | 'public'): Promise<void> {
    await this.options.client.send(new PutObjectAclCommand({ Bucket: this.options.bucket, Key: this.#key(path), ACL: visibility === 'public' ? 'public-read' : 'private' }))
  }

  async checksum(path: string) {
    const result = await this.#head(path, true)
    if (!result.ChecksumSHA256) throw new Error('S3 object does not expose a SHA-256 checksum.')
    return Object.freeze({ algorithm: 'sha256' as const, value: base64ToHex(result.ChecksumSHA256) })
  }

  async startMultipart(path: string, options: { readonly mimeType?: string } = {}): Promise<MultipartUpload> {
    const normalized = strictPath(path)
    const result = await this.options.client.send(new CreateMultipartUploadCommand({ Bucket: this.options.bucket, Key: this.#key(normalized), ContentType: options.mimeType })) as { UploadId?: string }
    if (!result.UploadId) throw new Error('S3 did not return a multipart upload ID.')
    return Object.freeze({ uploadId: result.UploadId, path: normalized })
  }

  async uploadPart(upload: MultipartUpload, partNumber: number, contents: FileContents | FilesystemStream): Promise<MultipartPart> {
    assertPartNumber(partNumber)
    const body = typeof contents === 'string' || contents instanceof Uint8Array ? toBytes(contents) : contents
    const result = await this.options.client.send(new UploadPartCommand({ Bucket: this.options.bucket, Key: this.#key(upload.path), UploadId: upload.uploadId, PartNumber: partNumber, Body: body as never })) as { ETag?: string }
    if (!result.ETag) throw new Error('S3 did not return a multipart part ETag.')
    return Object.freeze({ partNumber, etag: result.ETag })
  }

  async completeMultipart(upload: MultipartUpload, parts: readonly MultipartPart[]): Promise<void> {
    assertParts(parts)
    await this.options.client.send(new CompleteMultipartUploadCommand({ Bucket: this.options.bucket, Key: this.#key(upload.path), UploadId: upload.uploadId, MultipartUpload: { Parts: parts.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })) } }))
  }

  async abortMultipart(upload: MultipartUpload): Promise<void> {
    await this.options.client.send(new AbortMultipartUploadCommand({ Bucket: this.options.bucket, Key: this.#key(upload.path), UploadId: upload.uploadId }))
  }

  async #head(path: string, checksum = false): Promise<HeadResult> {
    return await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: this.#key(path), ...(checksum ? { ChecksumMode: 'ENABLED' as const } : {}) })) as HeadResult
  }

  async #sign(command: unknown, expiresIn: number): Promise<string> {
    const signer = this.options.signer ?? { sign: (value: unknown, ttl: number) => getSignedUrl(this.options.client as S3Client, value as never, { expiresIn: ttl }) }
    return await signer.sign(command, expiresIn)
  }

  async #createPost(input: S3PresignedPostInput): Promise<{ url: string, fields: Record<string, string> }> {
    if (this.options.postSigner) return await this.options.postSigner.create(input)
    return await createPresignedPost(this.options.client as S3Client, input as never)
  }

  #key(path: string, allowEmpty = false): string {
    const value = strictPath(path, allowEmpty)
    return this.#prefix ? (value ? `${this.#prefix}/${value}` : `${this.#prefix}/`) : value
  }

  #unkey(key: string): string | null {
    const boundary = this.#prefix ? `${this.#prefix}/` : ''
    return key.startsWith(boundary) ? key.slice(boundary.length) : null
  }
}

export class InMemoryS3UploadIssuanceStore implements S3UploadIssuanceStore {
  readonly #issuances = new Map<string, { issuance: S3UploadIssuance, state: 'pending' | 'reserved', token?: string }>()

  constructor(readonly maxPending = 10_000, readonly now: () => number = Date.now) {
    positiveInteger(maxPending, 'maxPending')
  }

  async save(issuance: S3UploadIssuance): Promise<void> {
    this.#pruneExpired()
    if (this.#issuances.size >= this.maxPending) throw new Error(`S3 upload issuances exceeded maxPending (${this.maxPending}).`)
    if (this.#issuances.has(issuance.id)) throw new Error('S3 upload issuance ID already exists.')
    this.#issuances.set(issuance.id, { issuance: Object.freeze({ ...issuance }), state: 'pending' })
  }

  async reserve(id: string, audience: string): Promise<S3UploadReservation | null> {
    const entry = this.#issuances.get(id)
    if (!entry) return null
    if (this.#expired(entry.issuance)) {
      this.#issuances.delete(id)
      return null
    }
    if (entry.issuance.audience !== audience) return null
    if (entry.state === 'reserved') throw new S3UploadConfirmationInProgressError(id)
    const token = globalThis.crypto.randomUUID()
    entry.state = 'reserved'
    entry.token = token
    return Object.freeze({ id, token, issuance: entry.issuance })
  }

  async release(reservation: S3UploadReservation): Promise<void> {
    const entry = this.#matchingReservation(reservation)
    if (!entry) return
    if (this.#expired(entry.issuance)) this.#issuances.delete(reservation.id)
    else {
      entry.state = 'pending'
      delete entry.token
    }
  }

  async complete(reservation: S3UploadReservation): Promise<void> {
    const entry = this.#matchingReservation(reservation)
    if (!entry) throw new Error('S3 upload reservation is no longer active.')
    if (this.#expired(entry.issuance)) {
      this.#issuances.delete(reservation.id)
      throw new Error('S3 upload reservation is no longer active because it expired.')
    }
    this.#issuances.delete(reservation.id)
  }

  #pruneExpired(): void {
    for (const [id, entry] of this.#issuances) {
      if (this.#expired(entry.issuance)) this.#issuances.delete(id)
    }
  }

  #matchingReservation(reservation: S3UploadReservation) {
    const entry = this.#issuances.get(reservation.id)
    return entry?.state === 'reserved' && entry.token === reservation.token ? entry : null
  }

  #expired(issuance: S3UploadIssuance): boolean {
    return new Date(issuance.policy.expiresAt).getTime() <= this.now()
  }
}

export class S3UploadConfirmationInProgressError extends Error {
  constructor(readonly grantId: string) {
    super('Direct upload confirmation is already in progress.')
    this.name = 'S3UploadConfirmationInProgressError'
  }
}

export function createAwsS3Filesystem(config: CreateAwsS3FilesystemConfig): AwsS3Filesystem {
  const { bucket, prefix, issuanceStore, maxListObjects, ...clientConfig } = config
  return new AwsS3Filesystem({ bucket, prefix, issuanceStore, maxListObjects, client: new S3Client(clientConfig) as S3CommandClient })
}

export function encodeCopySource(bucket: string, key: string): string {
  return [bucket, ...key.split('/')].map(encodeURIComponent).join('/')
}

function strictPath(path: string, allowEmpty = false): string {
  if (/^[a-z]:\//i.test(path)) throw new Error('Filesystem path must be relative.')
  const normalized = normalizeStoragePath(path, allowEmpty)
  if (path !== normalized) throw new Error('Filesystem path must already be normalized and relative.')
  return normalized
}

function positiveInteger(value: number, name = 'maxListObjects'): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
  return value
}

function secondsUntil(value: string): number {
  return temporaryUrlExpiresIn(new Date(value))
}
function safeHeader(value: string, name: string): string {
  if (!value || value.length > 255 || /[\r\n\0]/.test(value)) throw new Error(`Invalid ${name}.`)
  return value
}
function contentDisposition(name: string): string {
  safeHeader(name, 'downloadName')
  if (name.includes('"') || name.includes('\\')) throw new Error('Invalid downloadName.')
  return `attachment; filename="${name}"`
}
function hexToBase64(hex: string): string {
  const bytes = Uint8Array.from(hex.match(/.{2}/g) ?? [], value => Number.parseInt(value, 16))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function base64ToHex(value: string): string {
  return [...atob(value)].map(character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}
function assertPartNumber(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new Error('Multipart partNumber must be between 1 and 10000.')
}
function assertParts(parts: readonly MultipartPart[]): void {
  if (!parts.length || parts.length > 10_000) throw new Error('Multipart completion requires 1 to 10000 parts.')
  let previous = 0
  for (const part of parts) {
    assertPartNumber(part.partNumber)
    if (part.partNumber <= previous || !part.etag) throw new Error('Multipart parts must be unique, ordered and include ETags.')
    previous = part.partNumber
  }
}
async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of stream) {
    chunks.push(chunk)
    size += chunk.byteLength
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function isMissing(error: unknown): boolean {
  if (error instanceof FileNotFoundError) return true
  if (typeof error !== 'object' || error === null) return false
  const value = error as { name?: string, $metadata?: { httpStatusCode?: number } }
  return value.name === 'NoSuchKey' || value.name === 'NotFound' || value.$metadata?.httpStatusCode === 404
}

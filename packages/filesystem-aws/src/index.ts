import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { S3ClientConfig } from '@aws-sdk/client-s3'
import type { FileContents, Filesystem } from '@nuxt-laravelize/filesystem/runtime'
import { FileNotFoundError, normalizeStoragePath, toBytes } from '@nuxt-laravelize/filesystem/runtime'

export interface S3CommandClient { send(command: unknown): Promise<unknown> }
export interface AwsS3FilesystemOptions { bucket: string, prefix?: string, client: S3CommandClient, maxListObjects?: number }
export interface CreateAwsS3FilesystemConfig extends Omit<S3ClientConfig, 'region'> { bucket: string, prefix?: string, region: NonNullable<S3ClientConfig['region']>, maxListObjects?: number }

interface GetResult { Body?: Uint8Array | { transformToByteArray(): Promise<Uint8Array> } }
interface HeadResult { ContentLength?: number }
interface ListResult { Contents?: Array<{ Key?: string }>, IsTruncated?: boolean, NextContinuationToken?: string }

export class AwsS3Filesystem implements Filesystem {
  readonly #prefix: string
  readonly #maxListObjects: number

  constructor(readonly options: AwsS3FilesystemOptions) {
    if (!options.bucket.trim()) throw new Error('S3 bucket cannot be empty.')
    this.#prefix = strictPath(options.prefix ?? '', true)
    this.#maxListObjects = positiveInteger(options.maxListObjects ?? 100_000)
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
      return new Uint8Array(await result.Body.transformToByteArray())
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

  async #head(path: string): Promise<HeadResult> {
    return await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: this.#key(path) })) as HeadResult
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

export function createAwsS3Filesystem(config: CreateAwsS3FilesystemConfig): AwsS3Filesystem {
  const { bucket, prefix, maxListObjects, ...clientConfig } = config
  return new AwsS3Filesystem({ bucket, prefix, maxListObjects, client: new S3Client(clientConfig) as S3CommandClient })
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

function positiveInteger(value: number): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error('maxListObjects must be a positive integer.')
  return value
}

function isMissing(error: unknown): boolean {
  if (error instanceof FileNotFoundError) return true
  if (typeof error !== 'object' || error === null) return false
  const value = error as { name?: string, $metadata?: { httpStatusCode?: number } }
  return value.name === 'NoSuchKey' || value.name === 'NotFound' || value.$metadata?.httpStatusCode === 404
}

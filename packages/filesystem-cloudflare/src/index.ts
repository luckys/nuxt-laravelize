import type { FileContents, Filesystem, FilesystemStream } from '@nuxt-laravelize/filesystem/runtime'
import { FileNotFoundError, normalizeStoragePath, toBytes } from '@nuxt-laravelize/filesystem/runtime'

export interface R2ObjectBodyLike { arrayBuffer(): Promise<ArrayBuffer>, body?: ReadableStream<Uint8Array> }
export interface R2ObjectLike { size: number }
export interface R2ObjectsLike { objects: Array<R2ObjectLike & { key: string }>, truncated: boolean, cursor?: string }
export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>
  head(key: string): Promise<R2ObjectLike | null>
  put(key: string, value: Uint8Array | ReadableStream<Uint8Array>): Promise<unknown>
  delete(key: string): Promise<unknown>
  list(options?: { prefix?: string, cursor?: string, limit?: number }): Promise<R2ObjectsLike>
}

export interface CloudflareR2FilesystemOptions { prefix?: string, listPageSize?: number, maxListObjects?: number }

export class CloudflareR2Filesystem implements Filesystem {
  readonly #prefix: string
  readonly #pageSize: number
  readonly #maxListObjects: number

  constructor(readonly bucket: R2BucketLike, options: CloudflareR2FilesystemOptions = {}) {
    this.#prefix = strictPath(options.prefix ?? '', true)
    this.#pageSize = positiveInteger(options.listPageSize ?? 1000, 'listPageSize')
    this.#maxListObjects = positiveInteger(options.maxListObjects ?? 100_000, 'maxListObjects')
  }

  async write(path: string, contents: FileContents): Promise<void> { await this.bucket.put(this.#key(path), toBytes(contents)) }
  async read(path: string): Promise<Uint8Array> {
    const normalized = strictPath(path)
    const object = await this.bucket.get(this.#key(normalized))
    if (!object) throw new FileNotFoundError(normalized)
    return new Uint8Array(await object.arrayBuffer())
  }

  async readText(path: string): Promise<string> { return new TextDecoder().decode(await this.read(path)) }
  async exists(path: string): Promise<boolean> { return (await this.bucket.head(this.#key(path))) !== null }
  async delete(path: string): Promise<boolean> {
    const key = this.#key(path)
    if (await this.bucket.head(key) === null) return false
    await this.bucket.delete(key)
    return true
  }

  async copy(from: string, to: string): Promise<void> { await this.write(to, await this.read(from)) }
  async move(from: string, to: string): Promise<void> {
    const source = strictPath(from)
    const target = strictPath(to)
    if (source === target) {
      await this.read(source)
      return
    }
    await this.copy(source, target)
    await this.bucket.delete(this.#key(source))
  }

  async list(prefix = ''): Promise<string[]> {
    const normalized = strictPath(prefix, true)
    const storagePrefix = this.#key(normalized, true)
    const files: string[] = []
    let cursor: string | undefined
    do {
      const page = await this.bucket.list({ prefix: storagePrefix, cursor, limit: this.#pageSize })
      for (const object of page.objects) {
        const path = this.#unkey(object.key)
        if (path !== null && (!normalized || path === normalized || path.startsWith(`${normalized}/`))) files.push(path)
        if (files.length > this.#maxListObjects) throw new Error(`R2 listing exceeded maxListObjects (${this.#maxListObjects}).`)
      }
      if (!page.truncated) break
      if (!page.cursor || page.cursor === cursor) throw new Error('R2 returned a truncated listing without a progressing cursor.')
      cursor = page.cursor
    } while (cursor)
    return files.sort()
  }

  async size(path: string): Promise<number> {
    const normalized = strictPath(path)
    const object = await this.bucket.head(this.#key(normalized))
    if (!object) throw new FileNotFoundError(normalized)
    return object.size
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const normalized = strictPath(path)
    const object = await this.bucket.get(this.#key(normalized))
    if (!object) throw new FileNotFoundError(normalized)
    if (object.body) return object.body
    const bytes = new Uint8Array(await object.arrayBuffer())
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  async writeStream(path: string, contents: FilesystemStream): Promise<void> {
    const adapted = !(contents instanceof ReadableStream)
    const adaptation = adapted ? adaptAsyncIterable(contents) : undefined
    const stream = adaptation?.stream ?? contents as ReadableStream<Uint8Array>
    try {
      await this.bucket.put(this.#key(path), stream)
    }
    catch (error) {
      if (adapted) {
        try {
          await adaptation!.finalize()
        }
        catch { /* preserve the provider error */ }
      }
      throw error
    }
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

function strictPath(path: string, allowEmpty = false): string {
  if (/^[a-z]:\//i.test(path)) throw new Error('Filesystem path must be relative.')
  const normalized = normalizeStoragePath(path, allowEmpty)
  if (path !== normalized) throw new Error('Filesystem path must already be normalized and relative.')
  return normalized
}
function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`)
  return value
}

function adaptAsyncIterable(contents: AsyncIterable<Uint8Array>): { stream: ReadableStream<Uint8Array>, finalize(): Promise<void> } {
  const iterator = contents[Symbol.asyncIterator]()
  let finalized = false
  const finalize = async () => {
    if (finalized) return
    finalized = true
    await iterator.return?.()
  }
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next()
        if (result.done) {
          finalized = true
          controller.close()
        }
        else if (result.value instanceof Uint8Array) controller.enqueue(result.value)
        else throw new TypeError('Filesystem streams must yield Uint8Array chunks.')
      }
      catch (error) {
        try {
          await finalize()
        }
        catch { /* preserve the source error */ }
        controller.error(error)
      }
    },
    async cancel() {
      await finalize()
    },
  })
  return { stream, finalize }
}

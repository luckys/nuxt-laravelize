import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { ChecksumAlgorithm, FilesystemStream, FileVisibility } from '../AdvancedFilesystem'
import type { FileContents, Filesystem } from '../Filesystem'
import { FileNotFoundError } from '../Filesystem'
import { normalizeStoragePath, toBytes } from '../paths'

export class LocalFilesystem implements Filesystem {
  readonly #root: string

  constructor(root: string) {
    if (!root.trim()) throw new Error('Local filesystem root cannot be empty.')
    this.#root = resolve(root)
  }

  async write(path: string, contents: FileContents): Promise<void> {
    const target = await this.#resolve(path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, toBytes(contents))
  }

  async read(path: string): Promise<Uint8Array> {
    const normalized = normalizeStoragePath(path)
    try {
      return new Uint8Array(await readFile(await this.#resolve(normalized)))
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
      return (await stat(await this.#resolve(path))).isFile()
    }
    catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      await rm(await this.#resolve(path))
      return true
    }
    catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const target = await this.#resolve(to)
    await mkdir(dirname(target), { recursive: true })
    try {
      await copyFile(await this.#resolve(from), target)
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalizeStoragePath(from))
      throw error
    }
  }

  async move(from: string, to: string): Promise<void> {
    const target = await this.#resolve(to)
    await mkdir(dirname(target), { recursive: true })
    try {
      await rename(await this.#resolve(from), target)
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalizeStoragePath(from))
      throw error
    }
  }

  async list(prefix = ''): Promise<string[]> {
    const normalized = normalizeStoragePath(prefix, true)
    const directory = await this.#resolve(normalized, true)
    try {
      const entry = await stat(directory)
      if (entry.isFile()) return [normalized]
      const files = await walk(directory)
      return files.map(file => relative(this.#root, file).split(sep).join('/')).sort()
    }
    catch (error) {
      if (isMissing(error)) return []
      throw error
    }
  }

  async size(path: string): Promise<number> {
    try {
      return (await stat(await this.#resolve(path))).size
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalizeStoragePath(path))
      throw error
    }
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const normalized = normalizeStoragePath(path)
    if (!await this.exists(normalized)) throw new FileNotFoundError(normalized)
    return Readable.toWeb(createReadStream(await this.#resolve(normalized))) as ReadableStream<Uint8Array>
  }

  async writeStream(path: string, contents: FilesystemStream): Promise<void> {
    const target = await this.#resolve(path)
    await mkdir(dirname(target), { recursive: true })
    const source = Readable.from(contents as AsyncIterable<Uint8Array>)
    await pipeline(source, createWriteStream(target))
  }

  async checksum(path: string, algorithm: ChecksumAlgorithm = 'sha256') {
    if (algorithm !== 'sha256') throw new Error(`Unsupported checksum algorithm: ${algorithm}.`)
    const normalized = normalizeStoragePath(path)
    try {
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(await this.#resolve(normalized))) hash.update(chunk)
      return Object.freeze({ algorithm, value: hash.digest('hex') })
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalized)
      throw error
    }
  }

  async visibility(path: string): Promise<FileVisibility> {
    try {
      return ((await stat(await this.#resolve(path))).mode & 0o004) ? 'public' : 'private'
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalizeStoragePath(path))
      throw error
    }
  }

  async setVisibility(path: string, visibility: FileVisibility): Promise<void> {
    try {
      await chmod(await this.#resolve(path), visibility === 'public' ? 0o644 : 0o600)
    }
    catch (error) {
      if (isMissing(error)) throw new FileNotFoundError(normalizeStoragePath(path))
      throw error
    }
  }

  async #resolve(path: string, allowEmpty = false): Promise<string> {
    const normalized = normalizeStoragePath(path, allowEmpty)
    const target = resolve(this.#root, normalized)
    if (target !== this.#root && !target.startsWith(`${this.#root}${sep}`)) {
      throw new Error('Filesystem path cannot traverse outside its disk.')
    }
    await assertNoSymlinks(this.#root, target)
    return target
  }
}

async function assertNoSymlinks(root: string, target: string): Promise<void> {
  const segments = relative(root, target).split(sep).filter(Boolean)
  let current = root
  for (const segment of ['', ...segments]) {
    if (segment) current = resolve(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Local filesystem paths cannot contain symbolic links.')
    }
    catch (error) {
      if (isMissing(error)) return
      throw error
    }
  }
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

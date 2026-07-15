import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'

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

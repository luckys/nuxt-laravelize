import type { FileContents, Filesystem } from './Filesystem'
import { FileNotFoundError } from './Filesystem'
import { normalizeStoragePath, toBytes } from './paths'

export class InMemoryFilesystem implements Filesystem {
  readonly #files = new Map<string, Uint8Array>()

  async write(path: string, contents: FileContents): Promise<void> {
    this.#files.set(normalizeStoragePath(path), toBytes(contents))
  }

  async read(path: string): Promise<Uint8Array> {
    const normalized = normalizeStoragePath(path)
    const contents = this.#files.get(normalized)
    if (contents === undefined) throw new FileNotFoundError(normalized)
    return contents.slice()
  }

  async readText(path: string): Promise<string> {
    return new TextDecoder().decode(await this.read(path))
  }

  async exists(path: string): Promise<boolean> {
    return this.#files.has(normalizeStoragePath(path))
  }

  async delete(path: string): Promise<boolean> {
    return this.#files.delete(normalizeStoragePath(path))
  }

  async copy(from: string, to: string): Promise<void> {
    await this.write(to, await this.read(from))
  }

  async move(from: string, to: string): Promise<void> {
    const contents = await this.read(from)
    await this.write(to, contents)
    await this.delete(from)
  }

  async list(prefix = ''): Promise<string[]> {
    const normalized = normalizeStoragePath(prefix, true)
    const boundary = normalized ? `${normalized}/` : ''
    return [...this.#files.keys()].filter(path => !normalized || path === normalized || path.startsWith(boundary)).sort()
  }

  async size(path: string): Promise<number> {
    return (await this.read(path)).byteLength
  }

  async clear(): Promise<void> {
    this.#files.clear()
  }
}

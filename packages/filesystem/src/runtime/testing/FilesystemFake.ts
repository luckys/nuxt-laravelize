import { InMemoryFilesystem } from '../InMemoryFilesystem'

export class FilesystemFake extends InMemoryFilesystem {
  async assertExists(path: string): Promise<void> {
    if (!await this.exists(path)) throw new Error(`Expected filesystem to contain "${path}".`)
  }

  async assertMissing(path: string): Promise<void> {
    if (await this.exists(path)) throw new Error(`Expected filesystem not to contain "${path}".`)
  }

  async assertText(path: string, expected: string): Promise<void> {
    const actual = await this.readText(path)
    if (actual !== expected) throw new Error(`Expected "${path}" to contain the requested text.`)
  }

  reset(): Promise<void> {
    return this.clear()
  }
}

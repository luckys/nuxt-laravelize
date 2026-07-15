export type FileContents = string | Uint8Array

export interface Filesystem {
  write(path: string, contents: FileContents): Promise<void>
  read(path: string): Promise<Uint8Array>
  readText(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  delete(path: string): Promise<boolean>
  copy(from: string, to: string): Promise<void>
  move(from: string, to: string): Promise<void>
  list(prefix?: string): Promise<string[]>
  size(path: string): Promise<number>
}

export class FileNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`File not found: "${path}".`)
    this.name = 'FileNotFoundError'
  }
}

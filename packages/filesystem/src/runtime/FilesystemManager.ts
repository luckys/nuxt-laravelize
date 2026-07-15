import type { Filesystem } from './Filesystem'

export class FilesystemDiskNotFoundError extends Error {
  constructor(readonly diskName: string) {
    super(`Filesystem disk "${diskName}" is not registered.`)
    this.name = 'FilesystemDiskNotFoundError'
  }
}

export class FilesystemManager {
  readonly #disks = new Map<string, Filesystem>()

  constructor(readonly defaultDisk = 'default') {
    assertDiskName(defaultDisk)
  }

  register(name: string, filesystem: Filesystem): this {
    assertDiskName(name)
    this.#disks.set(name, filesystem)
    return this
  }

  disk(name = this.defaultDisk): Filesystem {
    const filesystem = this.#disks.get(name)
    if (filesystem === undefined) throw new FilesystemDiskNotFoundError(name)
    return filesystem
  }

  has(name: string): boolean {
    return this.#disks.has(name)
  }
}

function assertDiskName(name: string): void {
  if (!name.trim()) throw new Error('Filesystem disk name cannot be empty.')
}

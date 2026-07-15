import { describe, expect, it } from 'vitest'

import { FilesystemDiskNotFoundError, FilesystemManager } from '../../src/runtime/FilesystemManager'
import { InMemoryFilesystem } from '../../src/runtime/InMemoryFilesystem'

describe('FilesystemManager', () => {
  it('resolves default and named disks', () => {
    const primary = new InMemoryFilesystem()
    const archive = new InMemoryFilesystem()
    const manager = new FilesystemManager('primary').register('primary', primary).register('archive', archive)

    expect(manager.disk()).toBe(primary)
    expect(manager.disk('archive')).toBe(archive)
    expect(manager.has('archive')).toBe(true)
  })

  it('rejects unknown disks', () => {
    expect(() => new FilesystemManager().disk()).toThrow(FilesystemDiskNotFoundError)
  })
})

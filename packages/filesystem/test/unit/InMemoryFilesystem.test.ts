import { describe, expect, it } from 'vitest'

import { FileNotFoundError } from '../../src/runtime/Filesystem'
import { InMemoryFilesystem } from '../../src/runtime/InMemoryFilesystem'

describe('InMemoryFilesystem', () => {
  it('writes defensive byte copies and reads text', async () => {
    const filesystem = new InMemoryFilesystem()
    const bytes = new Uint8Array([65, 66])
    await filesystem.write('reports/data.bin', bytes)
    bytes[0] = 90

    await expect(filesystem.readText('reports/data.bin')).resolves.toBe('AB')
    const stored = await filesystem.read('reports/data.bin')
    stored[0] = 90
    await expect(filesystem.readText('reports/data.bin')).resolves.toBe('AB')
  })

  it('copies, moves, lists and deletes files', async () => {
    const filesystem = new InMemoryFilesystem()
    await filesystem.write('reports/a.txt', 'alpha')
    await filesystem.copy('reports/a.txt', 'reports/b.txt')
    await filesystem.move('reports/b.txt', 'archive/b.txt')

    await expect(filesystem.list('reports')).resolves.toEqual(['reports/a.txt'])
    await expect(filesystem.list()).resolves.toEqual(['archive/b.txt', 'reports/a.txt'])
    await expect(filesystem.size('archive/b.txt')).resolves.toBe(5)
    await expect(filesystem.delete('archive/b.txt')).resolves.toBe(true)
    await expect(filesystem.delete('archive/b.txt')).resolves.toBe(false)
  })

  it('keeps an existing file when moving it to the same normalized path', async () => {
    const filesystem = new InMemoryFilesystem()
    await filesystem.write('reports/a.txt', 'alpha')

    await filesystem.move('reports/a.txt', 'reports/a.txt')

    await expect(filesystem.readText('reports/a.txt')).resolves.toBe('alpha')
  })

  it('rejects traversal and reports missing files', async () => {
    const filesystem = new InMemoryFilesystem()
    await expect(filesystem.write('../secret', 'value')).rejects.toThrow('cannot traverse')
    await expect(filesystem.read('missing')).rejects.toBeInstanceOf(FileNotFoundError)
  })
})

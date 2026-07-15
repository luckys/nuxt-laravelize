import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { LocalFilesystem } from '../../src/runtime/drivers/LocalFilesystem'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('LocalFilesystem', () => {
  it('stores, lists, copies and moves files below its root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'laravelize-filesystem-'))
    directories.push(root)
    const filesystem = new LocalFilesystem(root)
    await filesystem.write('reports/a.txt', 'alpha')
    await filesystem.copy('reports/a.txt', 'reports/b.txt')
    await filesystem.move('reports/b.txt', 'archive/b.txt')

    await expect(filesystem.list()).resolves.toEqual(['archive/b.txt', 'reports/a.txt'])
    await expect(readFile(join(root, 'archive/b.txt'), 'utf8')).resolves.toBe('alpha')
  })

  it('rejects paths outside its configured root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'laravelize-filesystem-'))
    directories.push(root)
    const filesystem = new LocalFilesystem(root)

    await expect(filesystem.write('../secret.txt', 'secret')).rejects.toThrow('cannot traverse')
    await expect(filesystem.write('..\\secret.txt', 'secret')).rejects.toThrow('cannot traverse')
  })

  it('rejects symbolic links that escape its root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'laravelize-filesystem-'))
    const outside = await mkdtemp(join(tmpdir(), 'laravelize-filesystem-outside-'))
    directories.push(root, outside)
    await symlink(outside, join(root, 'linked'))
    const filesystem = new LocalFilesystem(root)

    await expect(filesystem.write('linked/secret.txt', 'secret')).rejects.toThrow('symbolic links')
  })
})

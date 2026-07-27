import { describe, expect, it } from 'vitest'

import {
  FilesystemCapabilityError,
  InMemoryFilesystemTombstoneStore,
  createDirectUploadPolicy,
  isDirectUploadFilesystem,
  isMultipartFilesystem,
  isTemporaryUrlFilesystem,
  isUploadConfirmationFilesystem,
  readOnlyFilesystem,
  quarantineFilesystem,
  ReadFallbackFilesystem,
  scopedFilesystem,
} from '../../src/runtime'
import { InMemoryFilesystem } from '../../src/runtime/InMemoryFilesystem'

describe('advanced filesystem contracts', () => {
  it('creates an immutable, serializable and fully bound direct-upload policy', () => {
    const policy = createDirectUploadPolicy({
      path: 'tenants/acme/uploads/a.pdf',
      keyPrefix: 'tenants/acme/uploads',
      maxBytes: 1024,
      mimeTypes: ['application/pdf'],
      checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
      actorId: 'user-1',
      tenantId: 'acme',
      expiresAt: '2030-01-01T00:05:00.000Z',
    }, new Date('2030-01-01T00:00:00.000Z'))

    expect(JSON.parse(JSON.stringify(policy))).toEqual(policy)
    expect(Object.isFrozen(policy)).toBe(true)
    expect(Object.isFrozen(policy.mimeTypes)).toBe(true)
    expect(() => (policy.mimeTypes as string[]).push('text/plain')).toThrow()
  })

  it('rejects policies that escape their prefix or are weakly constrained', () => {
    const base = {
      path: 'other/a.pdf', keyPrefix: 'tenants/acme', maxBytes: 10,
      mimeTypes: ['application/pdf'], actorId: 'user-1', tenantId: 'acme',
      expiresAt: '2030-01-01T00:05:00.000Z',
    }
    expect(() => createDirectUploadPolicy(base, new Date('2030-01-01T00:00:00.000Z'))).toThrow('keyPrefix')
    expect(() => createDirectUploadPolicy({ ...base, path: 'tenants/acme/a', keyPrefix: 'tenants/acme', mimeTypes: [] }, new Date('2030-01-01T00:00:00.000Z'))).toThrow('MIME')
    expect(() => createDirectUploadPolicy({ ...base, path: 'tenants/acme/a', keyPrefix: 'tenants/acme', expiresAt: '2030-01-09T00:00:00.000Z' }, new Date('2030-01-01T00:00:00.000Z'))).toThrow('seven days')
  })

  it('scopes every base operation and rejects path escapes', async () => {
    const base = new InMemoryFilesystem()
    const disk = scopedFilesystem(base, 'tenants/acme')
    await disk.write('reports/a.txt', 'alpha')
    await expect(base.readText('tenants/acme/reports/a.txt')).resolves.toBe('alpha')
    expect(() => disk.write('../other/a.txt', 'x')).toThrow('traverse')
    await expect(disk.list()).resolves.toEqual(['reports/a.txt'])
  })

  it('rejects confirmation results outside the exact scope boundary', async () => {
    const policy = createDirectUploadPolicy({
      path: 'uploads/a.txt', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'],
      actorId: 'actor', tenantId: 'tenant-a', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const base = Object.assign(new InMemoryFilesystem(), {
      confirmUpload: async () => ({ path: 'tenant-ab/uploads/a.txt', bytes: 1, mimeType: 'text/plain', actorId: 'actor', tenantId: 'tenant-a' }),
    })
    const disk = scopedFilesystem(base, 'tenant-a')
    if (!isUploadConfirmationFilesystem(disk)) throw new Error('Expected upload confirmation capability.')
    const grant = { id: 'grant', url: 'https://example.test', method: 'POST' as const, fields: {}, mimeType: 'text/plain', policy }

    await expect(disk.confirmUpload(grant)).rejects.toThrow('escaped its scoped disk')
  })

  it('makes read-only disks fail closed for base and optional mutations', async () => {
    const base = new InMemoryFilesystem()
    await base.write('a.txt', 'alpha')
    const disk = readOnlyFilesystem(base)

    await expect(disk.readText('a.txt')).resolves.toBe('alpha')
    await expect(disk.write('b.txt', 'beta')).rejects.toBeInstanceOf(FilesystemCapabilityError)
    expect(isDirectUploadFilesystem(disk)).toBe(false)
    expect(isMultipartFilesystem(disk)).toBe(false)
    expect(isTemporaryUrlFilesystem(disk)).toBe(false)
  })

  it('uses capability guards that fail closed', () => {
    const disk = new InMemoryFilesystem()
    expect(isTemporaryUrlFilesystem(disk)).toBe(false)
    expect(isDirectUploadFilesystem(disk)).toBe(false)
    expect(isMultipartFilesystem(disk)).toBe(false)
  })

  it('uses fallback only for reads and never duplicates writes', async () => {
    const primary = new InMemoryFilesystem()
    const fallback = new InMemoryFilesystem()
    await fallback.write('legacy.txt', 'fallback')
    const disk = new ReadFallbackFilesystem(primary, fallback, new InMemoryFilesystemTombstoneStore())

    await expect(disk.readText('legacy.txt')).resolves.toBe('fallback')
    await disk.write('new.txt', 'primary')
    await expect(primary.exists('new.txt')).resolves.toBe(true)
    await expect(fallback.exists('new.txt')).resolves.toBe(false)
    await expect(disk.delete('legacy.txt')).resolves.toBe(true)
    await expect(fallback.exists('legacy.txt')).resolves.toBe(true)
  })

  it('requires an explicit tombstone store for mutable fallback disks', () => {
    expect(() => new ReadFallbackFilesystem(new InMemoryFilesystem(), new InMemoryFilesystem(), undefined as never)).toThrow('explicit tombstone store')
  })

  it('tombstones logical deletes so stale fallback files cannot resurrect', async () => {
    const primary = new InMemoryFilesystem()
    const fallback = new InMemoryFilesystem()
    await fallback.write('stale.txt', 'old')
    const disk = new ReadFallbackFilesystem(primary, fallback, new InMemoryFilesystemTombstoneStore())

    await expect(disk.delete('stale.txt')).resolves.toBe(true)
    await expect(disk.exists('stale.txt')).resolves.toBe(false)
    await expect(disk.read('stale.txt')).rejects.toMatchObject({ name: 'FileNotFoundError', path: 'stale.txt' })
    await expect(disk.size('stale.txt')).rejects.toMatchObject({ name: 'FileNotFoundError' })
    await expect(disk.list()).resolves.toEqual([])
    await expect(disk.copy('stale.txt', 'copy.txt')).rejects.toMatchObject({ name: 'FileNotFoundError' })

    await disk.write('stale.txt', 'new')
    await expect(disk.readText('stale.txt')).resolves.toBe('new')

    await fallback.write('copy.txt', 'old copy')
    await disk.delete('copy.txt')
    await expect(disk.copy('missing-source.txt', 'copy.txt')).rejects.toMatchObject({ name: 'FileNotFoundError' })
    await expect(disk.exists('copy.txt')).resolves.toBe(false)
    await primary.write('source.txt', 'fresh copy')
    await disk.copy('source.txt', 'copy.txt')
    await expect(disk.readText('copy.txt')).resolves.toBe('fresh copy')
  })

  it('tombstones move sources and preserves tombstones through scopes', async () => {
    const primary = new InMemoryFilesystem()
    const fallback = new InMemoryFilesystem()
    await primary.write('tenant/current.txt', 'current')
    await fallback.write('tenant/current.txt', 'stale')
    await fallback.write('tenant/archive.txt', 'old archive')
    const disk = scopedFilesystem(new ReadFallbackFilesystem(primary, fallback, new InMemoryFilesystemTombstoneStore()), 'tenant')

    await disk.delete('archive.txt')
    await disk.move('current.txt', 'archive.txt')

    await expect(disk.exists('current.txt')).resolves.toBe(false)
    await expect(disk.readText('archive.txt')).resolves.toBe('current')
    await expect(disk.list()).resolves.toEqual(['archive.txt'])
  })

  it('keeps quarantine explicit and releases only after destination succeeds', async () => {
    const base = new InMemoryFilesystem()
    const quarantine = quarantineFilesystem(base)
    const destination = new InMemoryFilesystem()
    await quarantine.disk.write('upload.bin', 'safe')

    await quarantine.release('upload.bin', destination, 'accepted/upload.bin')

    await expect(destination.readText('accepted/upload.bin')).resolves.toBe('safe')
    await expect(quarantine.disk.exists('upload.bin')).resolves.toBe(false)
  })

  it('shares durable-style tombstones across recreated fallback wrappers', async () => {
    const primary = new InMemoryFilesystem()
    const fallback = new InMemoryFilesystem()
    const tombstones = new InMemoryFilesystemTombstoneStore()
    await fallback.write('deleted.txt', 'stale')
    const first = new ReadFallbackFilesystem(primary, fallback, tombstones)
    await first.delete('deleted.txt')

    const recreated = new ReadFallbackFilesystem(primary, fallback, tombstones)

    await expect(recreated.exists('deleted.txt')).resolves.toBe(false)
    await expect(recreated.read('deleted.txt')).rejects.toMatchObject({ name: 'FileNotFoundError' })
    await expect(recreated.list()).resolves.toEqual([])
  })

  it('records a delete tombstone before primary mutation and retains it on failure', async () => {
    const primary = Object.assign(new InMemoryFilesystem(), {
      delete: async () => {
        throw new Error('primary unavailable')
      },
    })
    const fallback = new InMemoryFilesystem()
    const tombstones = new InMemoryFilesystemTombstoneStore()
    await fallback.write('deleted.txt', 'stale')
    const disk = new ReadFallbackFilesystem(primary, fallback, tombstones)

    await expect(disk.delete('deleted.txt')).rejects.toThrow('primary unavailable')

    const recreated = new ReadFallbackFilesystem(primary, fallback, tombstones)
    await expect(recreated.exists('deleted.txt')).resolves.toBe(false)
  })

  it('keeps a monotonic tombstone while exposing a replacement primary', async () => {
    const stored = new InMemoryFilesystem()
    let writeStarted!: () => void
    let finishWrite!: () => void
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve
    })
    const gate = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    const primary = Object.assign(stored, {
      async write(path: string, contents: string | Uint8Array) {
        writeStarted()
        await gate
        await InMemoryFilesystem.prototype.write.call(stored, path, contents)
      },
    })
    const tombstones = new InMemoryFilesystemTombstoneStore()
    await tombstones.record('file.txt')
    const fallback = new InMemoryFilesystem()
    await fallback.write('file.txt', 'stale')
    const disk = new ReadFallbackFilesystem(primary, fallback, tombstones)

    const write = disk.write('file.txt', 'new')
    await started
    await tombstones.record('file.txt')
    finishWrite()
    await write

    await expect(disk.readText('file.txt')).resolves.toBe('new')
    await InMemoryFilesystem.prototype.delete.call(stored, 'file.txt')
    await expect(disk.exists('file.txt')).resolves.toBe(false)
  })

  it('hides fallback when a delayed delete completes after a concurrent write', async () => {
    const stored = new InMemoryFilesystem()
    await stored.write('file.txt', 'primary-old')
    let deleteStarted!: () => void
    let finishDelete!: () => void
    const started = new Promise<void>((resolve) => {
      deleteStarted = resolve
    })
    const gate = new Promise<void>((resolve) => {
      finishDelete = resolve
    })
    const primary = Object.assign(stored, {
      async delete(path: string) {
        deleteStarted()
        await gate
        return await InMemoryFilesystem.prototype.delete.call(stored, path)
      },
      async write(path: string, contents: string | Uint8Array) {
        await InMemoryFilesystem.prototype.write.call(stored, path, contents)
      },
    })
    const fallback = new InMemoryFilesystem()
    await fallback.write('file.txt', 'stale')
    const tombstones = new InMemoryFilesystemTombstoneStore()
    const deleting = new ReadFallbackFilesystem(primary, fallback, tombstones)
    const writing = new ReadFallbackFilesystem(primary, fallback, tombstones)

    const deletion = deleting.delete('file.txt')
    await started
    await writing.write('file.txt', 'new')
    finishDelete()
    await deletion

    await expect(writing.exists('file.txt')).resolves.toBe(false)
    await expect(writing.read('file.txt')).rejects.toMatchObject({ name: 'FileNotFoundError' })
  })

  it('exposes a delayed replacement write that completes after delete but never resurrects fallback later', async () => {
    const stored = new InMemoryFilesystem()
    let writeStarted!: () => void
    let finishWrite!: () => void
    const started = new Promise<void>((resolve) => {
      writeStarted = resolve
    })
    const gate = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    const primary = Object.assign(stored, {
      async write(path: string, contents: string | Uint8Array) {
        writeStarted()
        await gate
        await InMemoryFilesystem.prototype.write.call(stored, path, contents)
      },
      async delete(path: string) {
        return await InMemoryFilesystem.prototype.delete.call(stored, path)
      },
    })
    const fallback = new InMemoryFilesystem()
    await fallback.write('file.txt', 'stale')
    const tombstones = new InMemoryFilesystemTombstoneStore()
    const writing = new ReadFallbackFilesystem(primary, fallback, tombstones)
    const deleting = new ReadFallbackFilesystem(primary, fallback, tombstones)

    const write = writing.write('file.txt', 'new')
    await started
    await deleting.delete('file.txt')
    finishWrite()
    await write

    await expect(deleting.readText('file.txt')).resolves.toBe('new')
    await InMemoryFilesystem.prototype.delete.call(stored, 'file.txt')
    await expect(deleting.read('file.txt')).rejects.toMatchObject({ name: 'FileNotFoundError' })
  })

  it('keeps copy and move tombstones authoritative while primary destinations remain visible', async () => {
    const primary = new InMemoryFilesystem()
    const fallback = new InMemoryFilesystem()
    await primary.write('source.txt', 'source')
    await fallback.write('source.txt', 'stale source')
    await fallback.write('copy.txt', 'stale copy')
    await fallback.write('moved.txt', 'stale moved')
    const tombstones = new InMemoryFilesystemTombstoneStore()
    const disk = new ReadFallbackFilesystem(primary, fallback, tombstones)
    await disk.delete('copy.txt')
    await disk.delete('moved.txt')

    await disk.copy('source.txt', 'copy.txt')
    await disk.move('source.txt', 'moved.txt')

    await expect(disk.list()).resolves.toEqual(['copy.txt', 'moved.txt'])
    await expect(disk.readText('copy.txt')).resolves.toBe('source')
    await expect(disk.readText('moved.txt')).resolves.toBe('source')
    await expect(disk.exists('source.txt')).resolves.toBe(false)
    await primary.delete('copy.txt')
    await primary.delete('moved.txt')
    await expect(disk.list()).resolves.toEqual([])
  })
})

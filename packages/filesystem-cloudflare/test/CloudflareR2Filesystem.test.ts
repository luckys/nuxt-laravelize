import { describe, expect, it, vi } from 'vitest'

import { CloudflareR2Filesystem } from '../src'

function bucket(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async () => null), head: vi.fn(async () => null), put: vi.fn(async () => undefined), delete: vi.fn(async () => undefined), list: vi.fn(async () => ({ objects: [], truncated: false })), ...overrides,
  }
}

describe('CloudflareR2Filesystem', () => {
  it('preserves bytes and scopes keys to its normalized prefix', async () => {
    const bytes = new Uint8Array([0, 255, 65])
    const binding = bucket({ get: vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([0, 255, 65]).buffer })) })
    const filesystem = new CloudflareR2Filesystem(binding, { prefix: 'tenant/a' })
    await filesystem.write('data.bin', bytes)
    bytes[0] = 9
    expect(binding.put).toHaveBeenCalledWith('tenant/a/data.bin', new Uint8Array([0, 255, 65]))
    await expect(filesystem.read('data.bin')).resolves.toEqual(new Uint8Array([0, 255, 65]))
  })

  it('reports missing files and rejects ambiguous or escaping paths and prefixes', async () => {
    const filesystem = new CloudflareR2Filesystem(bucket())
    await expect(filesystem.read('missing')).rejects.toMatchObject({ name: 'FileNotFoundError', path: 'missing' })
    for (const path of ['../secret', '/absolute', 'C:/absolute', 'a//b', 'a/./b', 'a\\b', 'a\0b']) await expect(filesystem.write(path, 'x')).rejects.toThrow()
    expect(() => new CloudflareR2Filesystem(bucket(), { prefix: '../tenant' })).toThrow()
  })

  it('paginates listings, strips only its prefix and sorts paths', async () => {
    const binding = bucket({ list: vi.fn()
      .mockResolvedValueOnce({ objects: [{ key: 'tenant/reports/b.txt', size: 1 }, { key: 'other/leak.txt', size: 1 }], truncated: true, cursor: 'next' })
      .mockResolvedValueOnce({ objects: [{ key: 'tenant/reports/a.txt', size: 1 }], truncated: false }) })
    const filesystem = new CloudflareR2Filesystem(binding, { prefix: 'tenant', listPageSize: 2 })
    await expect(filesystem.list('reports')).resolves.toEqual(['reports/a.txt', 'reports/b.txt'])
    expect(binding.list).toHaveBeenNthCalledWith(2, { prefix: 'tenant/reports', cursor: 'next', limit: 2 })
  })

  it('deletes a move source only after the destination write succeeds', async () => {
    const calls: string[] = []
    const binding = bucket({
      get: vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1]).buffer })),
      put: vi.fn(async () => {
        calls.push('put')
        throw new Error('write failed')
      }),
      delete: vi.fn(async () => { calls.push('delete') }),
    })
    await expect(new CloudflareR2Filesystem(binding).move('from', 'to')).rejects.toThrow('write failed')
    expect(calls).toEqual(['put'])
  })
})

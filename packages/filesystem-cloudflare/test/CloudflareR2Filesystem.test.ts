import { describe, expect, it, vi } from 'vitest'

import { CloudflareR2Filesystem } from '../src'
import { isDirectUploadFilesystem, isStreamFilesystem, isTemporaryUrlFilesystem } from '@nuxt-laravelize/filesystem/runtime'

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

  it('uses native R2 streams without claiming URL signing capabilities', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const binding = bucket({ get: vi.fn(async () => ({ body: stream, arrayBuffer: vi.fn() })) })
    const filesystem = new CloudflareR2Filesystem(binding)
    expect(isStreamFilesystem(filesystem)).toBe(true)
    expect(isTemporaryUrlFilesystem(filesystem)).toBe(false)
    expect(isDirectUploadFilesystem(filesystem)).toBe(false)
    await expect(filesystem.readStream('a')).resolves.toBe(stream)
    await filesystem.writeStream('b', stream)
    expect(binding.put).toHaveBeenCalledWith('b', stream)
  })

  it('adapts async iterables to web streams without buffering', async () => {
    const received: number[] = []
    const binding = bucket({ put: vi.fn(async (_key: string, body: ReadableStream<Uint8Array>) => {
      for await (const chunk of body) received.push(...chunk)
    }) })
    const filesystem = new CloudflareR2Filesystem(binding)
    async function* chunks() {
      yield new Uint8Array([1, 2])
      yield new Uint8Array([3])
    }

    await filesystem.writeStream('iterable.bin', chunks())

    expect(received).toEqual([1, 2, 3])
  })

  it('propagates async iterable failures through the R2 web stream', async () => {
    const binding = bucket({ put: vi.fn(async (_key: string, body: ReadableStream<Uint8Array>) => {
      for await (const _chunk of body) { /* consume */ }
    }) })
    const filesystem = new CloudflareR2Filesystem(binding)
    const release = vi.fn(async () => ({ done: true as const, value: undefined }))
    let reads = 0
    const failing: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        async next() {
          if (reads++ === 0) return { done: false as const, value: new Uint8Array([1]) }
          throw new Error('stream failed')
        },
        return: release,
      }),
    }

    await expect(filesystem.writeStream('broken.bin', failing)).rejects.toThrow('stream failed')
    expect(release).toHaveBeenCalledOnce()
  })

  it('finalizes an adapted iterable once when R2 rejects put', async () => {
    const release = vi.fn(async () => ({ done: true as const, value: undefined }))
    const iterable: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: false as const, value: new Uint8Array([1]) }),
        return: release,
      }),
    }
    const binding = bucket({ put: vi.fn(async () => {
      throw new Error('provider rejected')
    }) })
    const filesystem = new CloudflareR2Filesystem(binding)

    await expect(filesystem.writeStream('rejected.bin', iterable)).rejects.toThrow('provider rejected')
    expect(release).toHaveBeenCalledOnce()
  })
})

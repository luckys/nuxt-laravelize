import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { AwsS3Filesystem, encodeCopySource } from '../src'

describe('AwsS3Filesystem', () => {
  it('uses S3 commands, preserves bytes and scopes keys', async () => {
    const send = vi.fn(async (command: unknown) => command instanceof GetObjectCommand ? { Body: { transformToByteArray: async () => new Uint8Array([0, 255]) } } : {})
    const filesystem = new AwsS3Filesystem({ bucket: 'files', prefix: 'tenant/a', client: { send } })
    await filesystem.write('x.bin', new Uint8Array([0, 255]))
    await expect(filesystem.read('x.bin')).resolves.toEqual(new Uint8Array([0, 255]))
    expect(send.mock.calls[0]![0]).toBeInstanceOf(PutObjectCommand)
    expect((send.mock.calls[0]![0] as PutObjectCommand).input).toMatchObject({ Bucket: 'files', Key: 'tenant/a/x.bin', Body: new Uint8Array([0, 255]) })
  })

  it('maps S3 404s to the filesystem missing behavior', async () => {
    const missing = Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send: vi.fn(async () => {
      throw missing
    }) } })
    await expect(filesystem.read('missing')).rejects.toMatchObject({ name: 'FileNotFoundError', path: 'missing' })
    await expect(filesystem.exists('missing')).resolves.toBe(false)
    await expect(filesystem.size('missing')).rejects.toMatchObject({ name: 'FileNotFoundError' })
  })

  it('paginates and does not leak keys outside its prefix', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Contents: [{ Key: 'tenant/reports/b' }, { Key: 'outside/leak' }], IsTruncated: true, NextContinuationToken: 'two' })
      .mockResolvedValueOnce({ Contents: [{ Key: 'tenant/reports/a' }], IsTruncated: false })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', prefix: 'tenant', client: { send } })
    await expect(filesystem.list('reports')).resolves.toEqual(['reports/a', 'reports/b'])
    expect(send.mock.calls[0]![0]).toBeInstanceOf(ListObjectsV2Command)
    expect((send.mock.calls[1]![0] as ListObjectsV2Command).input.ContinuationToken).toBe('two')
  })

  it('copies with segment encoding and deletes a move source only after copy succeeds', async () => {
    const calls: unknown[] = []
    const send = vi.fn(async (command: unknown) => {
      calls.push(command)
      if (command instanceof CopyObjectCommand) throw new Error('copy failed')
      return {}
    })
    const filesystem = new AwsS3Filesystem({ bucket: 'my bucket', client: { send } })
    await expect(filesystem.move('a file/é.txt', 'target')).rejects.toThrow('copy failed')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBeInstanceOf(CopyObjectCommand)
    expect((calls[0] as CopyObjectCommand).input.CopySource).toBe('my%20bucket/a%20file/%C3%A9.txt')
    expect(calls.some(command => command instanceof DeleteObjectCommand)).toBe(false)
    expect(encodeCopySource('bucket', 'a/b c')).toBe('bucket/a/b%20c')
  })

  it('uses HeadObject metadata and rejects unsafe paths', async () => {
    const send = vi.fn(async (command: unknown) => command instanceof HeadObjectCommand ? { ContentLength: 7 } : {})
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send } })
    await expect(filesystem.size('safe')).resolves.toBe(7)
    for (const path of ['../x', '/x', 'C:/x', 'a//b', 'a/./b', 'a\\b', 'a\0b']) await expect(filesystem.write(path, 'x')).rejects.toThrow()
  })
})

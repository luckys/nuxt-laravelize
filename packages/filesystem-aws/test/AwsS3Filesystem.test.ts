import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectAclCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectAclCommand, PutObjectCommand, S3Client, UploadPartCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'

import { createDirectUploadPolicy, isDirectUploadFilesystem, isMultipartFilesystem, isTemporaryUrlFilesystem, isUploadConfirmationFilesystem, scopedFilesystem } from '@nuxt-laravelize/filesystem/runtime'
import { AwsS3Filesystem, InMemoryS3UploadIssuanceStore, S3UploadConfirmationInProgressError, encodeCopySource } from '../src'

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

  it('signs temporary downloads through an injected signer', async () => {
    const sign = vi.fn(async (_command: unknown, _expiresIn: number) => 'https://signed.example/download')
    const filesystem = new AwsS3Filesystem({ bucket: 'files', prefix: 'tenant', client: { send: vi.fn() }, signer: { sign } })
    expect(isTemporaryUrlFilesystem(filesystem)).toBe(true)
    if (!isTemporaryUrlFilesystem(filesystem)) throw new Error('Expected temporary URL capability.')

    await expect(filesystem.temporaryUrl('a report.pdf', { expiresAt: new Date(Date.now() + 60_000), downloadName: 'report.pdf' })).resolves.toBe('https://signed.example/download')
    expect(sign.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand)
    expect((sign.mock.calls[0]![0] as GetObjectCommand).input).toMatchObject({ Bucket: 'files', Key: 'tenant/a report.pdf', ResponseContentDisposition: 'attachment; filename="report.pdf"' })
  })

  it('fails URL capability guards closed for an injected command client without a signer', () => {
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send: vi.fn() } })
    expect(isTemporaryUrlFilesystem(filesystem)).toBe(false)
    expect(isDirectUploadFilesystem(filesystem)).toBe(false)
  })

  it('creates a real presigned POST with bounded size, exact MIME and no synthetic CRC32', async () => {
    const filesystem = new AwsS3Filesystem({
      bucket: 'files',
      prefix: 'tenant',
      client: new S3Client({ region: 'us-east-1', credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' } }),
    })
    const policy = createDirectUploadPolicy({
      path: 'uploads/a.txt', keyPrefix: 'uploads', maxBytes: 100,
      mimeTypes: ['text/plain', 'application/octet-stream'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'actor-1', tenantId: 'tenant-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')

    const grant = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })
    const signedPolicy = JSON.parse(Buffer.from(grant.fields.Policy!, 'base64').toString('utf8')) as { conditions: unknown[] }

    expect(grant).toMatchObject({ method: 'POST', mimeType: 'text/plain' })
    expect(grant.fields).toMatchObject({ 'key': 'tenant/uploads/a.txt', 'Content-Type': 'text/plain', 'x-amz-meta-actorid': 'actor-1', 'x-amz-meta-tenantid': 'tenant-1' })
    expect(grant.fields).not.toHaveProperty('x-amz-checksum-crc32')
    expect(grant.fields['x-amz-checksum-sha256']).toBe('q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=')
    expect(signedPolicy.conditions).toEqual(expect.arrayContaining([
      ['content-length-range', 0, 100],
      ['eq', '$key', 'tenant/uploads/a.txt'],
      ['eq', '$Content-Type', 'text/plain'],
      ['eq', '$x-amz-meta-actorid', 'actor-1'],
      ['eq', '$x-amz-meta-tenantid', 'tenant-1'],
      ['eq', '$x-amz-checksum-sha256', 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s='],
    ]))
  })

  it('rejects S3 direct-upload issuance without SHA-256 before signing', async () => {
    const create = vi.fn(async () => ({ url: 'https://example.test', fields: {} }))
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send: vi.fn() }, postSigner: { create } })
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], actorId: 'a', tenantId: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')

    await expect(filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })).rejects.toThrow('require an exact SHA-256')
    expect(create).not.toHaveBeenCalled()
  })

  it('binds direct uploads and confirms provider metadata before acceptance', async () => {
    const policy = createDirectUploadPolicy({
      path: 'uploads/a.pdf', keyPrefix: 'uploads', maxBytes: 100,
      mimeTypes: ['application/pdf'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) },
      actorId: 'user-1', tenantId: 'tenant-1', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const send = vi.fn(async (command: unknown) => command instanceof HeadObjectCommand
      ? { ContentLength: 80, ContentType: 'application/pdf', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'user-1', tenantid: 'tenant-1' } }
      : {})
    const createPost = vi.fn(async () => ({ url: 'https://signed.example/upload', fields: { key: 'uploads/a.pdf' } }))
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send }, postSigner: { create: createPost } })
    expect(isDirectUploadFilesystem(filesystem)).toBe(true)
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')

    const grant = await filesystem.createDirectUpload({ policy, mimeType: 'application/pdf' })
    expect(grant).toMatchObject({ method: 'POST', mimeType: 'application/pdf', fields: { key: 'uploads/a.pdf' } })
    expect(createPost).toHaveBeenCalledOnce()
    await expect(filesystem.confirmUpload({ ...grant, id: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow('not issued')
    await expect(filesystem.confirmUpload(grant)).resolves.toMatchObject({ path: 'uploads/a.pdf', bytes: 80, actorId: 'user-1', tenantId: 'tenant-1' })
    await expect(filesystem.confirmUpload(grant)).rejects.toThrow('already confirmed')
  })

  it('releases a confirmation reservation after metadata mismatch so it can retry', async () => {
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'a', tenantId: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    const send = vi.fn()
      .mockResolvedValueOnce({ ContentLength: 11, ContentType: 'text/plain', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'a', tenantid: 't' } })
      .mockResolvedValueOnce({ ContentLength: 10, ContentType: 'text/plain', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'a', tenantid: 't' } })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send }, postSigner: { create: vi.fn(async () => ({ url: 'https://example.test', fields: {} })) } })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')
    const grant = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })
    await expect(filesystem.confirmUpload(grant)).rejects.toThrow('maximum')
    await expect(filesystem.confirmUpload(grant)).resolves.toMatchObject({ path: 'uploads/a', bytes: 10 })
  })

  it('releases a confirmation reservation after a transient provider failure', async () => {
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'a', tenantId: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    const metadata = { ContentLength: 10, ContentType: 'text/plain', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'a', tenantid: 't' } }
    const send = vi.fn().mockRejectedValueOnce(new Error('S3 unavailable')).mockResolvedValueOnce(metadata)
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send }, postSigner: { create: vi.fn(async () => ({ url: 'https://example.test', fields: {} })) } })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')
    const grant = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })

    await expect(filesystem.confirmUpload(grant)).rejects.toThrow('S3 unavailable')
    await expect(filesystem.confirmUpload(grant)).resolves.toMatchObject({ path: 'uploads/a' })
  })

  it('allows only one concurrent confirmation reservation', async () => {
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'a', tenantId: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    let startHead!: () => void
    let finishHead!: () => void
    const headStarted = new Promise<void>((resolve) => {
      startHead = resolve
    })
    const headGate = new Promise<void>((resolve) => {
      finishHead = resolve
    })
    const send = vi.fn(async () => {
      startHead()
      await headGate
      return { ContentLength: 10, ContentType: 'text/plain', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'a', tenantid: 't' } }
    })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send }, postSigner: { create: vi.fn(async () => ({ url: 'https://example.test', fields: {} })) } })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')
    const grant = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })

    const first = filesystem.confirmUpload(grant)
    await headStarted
    await expect(filesystem.confirmUpload(grant)).rejects.toBeInstanceOf(S3UploadConfirmationInProgressError)
    finishHead()
    await expect(first).resolves.toMatchObject({ path: 'uploads/a' })
  })

  it('expires pending confirmation authority before provider access', async () => {
    const issuedAt = Date.now()
    let now = issuedAt
    const issuanceStore = new InMemoryS3UploadIssuanceStore(10, () => now)
    const send = vi.fn()
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'a', tenantId: 't', expiresAt: new Date(issuedAt + 60_000).toISOString() })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send }, postSigner: { create: vi.fn(async () => ({ url: 'https://example.test', fields: {} })) }, issuanceStore })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')
    const grant = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })
    now = issuedAt + 60_001

    await expect(filesystem.confirmUpload(grant)).rejects.toThrow('expired')
    expect(send).not.toHaveBeenCalled()
  })

  it('releases issuance capacity immediately after confirmation', async () => {
    const issuanceStore = new InMemoryS3UploadIssuanceStore(1)
    const metadata = { ContentLength: 10, ContentType: 'text/plain', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'a', tenantid: 't' } }
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send: vi.fn(async () => metadata) }, postSigner: { create: vi.fn(async () => ({ url: 'https://example.test', fields: {} })) }, issuanceStore })
    if (!isDirectUploadFilesystem(filesystem)) throw new Error('Expected direct upload capability.')
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'a', tenantId: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    const first = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })
    await filesystem.confirmUpload(first)
    await expect(filesystem.confirmUpload(first)).rejects.toThrow('already confirmed')

    const second = await filesystem.createDirectUpload({ policy, mimeType: 'text/plain' })
    await expect(filesystem.confirmUpload(second)).resolves.toMatchObject({ path: 'uploads/a' })
  })

  it('binds shared issuances to the exact scoped audience', async () => {
    const issuanceStore = new InMemoryS3UploadIssuanceStore()
    const metadata = { ContentLength: 10, ContentType: 'text/plain', ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=', Metadata: { actorid: 'a', tenantid: 'tenant-a' } }
    const postSigner = { create: vi.fn(async () => ({ url: 'https://example.test', fields: {} })) }
    const tenantA = scopedFilesystem(new AwsS3Filesystem({ bucket: 'files', client: { send: vi.fn(async () => metadata) }, postSigner, issuanceStore }), 'tenant-a')
    const tenantBClient = { send: vi.fn(async () => metadata) }
    const tenantB = scopedFilesystem(new AwsS3Filesystem({ bucket: 'files', client: tenantBClient, postSigner, issuanceStore }), 'tenant-b')
    const policy = createDirectUploadPolicy({ path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'a', tenantId: 'tenant-a', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    if (!isDirectUploadFilesystem(tenantA) || !isUploadConfirmationFilesystem(tenantA) || !isUploadConfirmationFilesystem(tenantB)) throw new Error('Expected direct upload capabilities.')
    const grant = await tenantA.createDirectUpload({ policy, mimeType: 'text/plain' })

    await expect(tenantB.confirmUpload(grant)).rejects.toThrow('this scope')
    expect(tenantBClient.send).not.toHaveBeenCalled()
    await expect(tenantA.confirmUpload(grant)).resolves.toMatchObject({ path: 'uploads/a', tenantId: 'tenant-a' })
  })

  it('uses explicit multipart lifecycle commands', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'upload-1' }
      if (command instanceof UploadPartCommand) return { ETag: 'etag-1' }
      return {}
    })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send }, signer: { sign: vi.fn(async (_command: unknown, _expiresIn: number) => '') } })
    expect(isMultipartFilesystem(filesystem)).toBe(true)
    const upload = await filesystem.startMultipart('large.bin')
    const part = await filesystem.uploadPart(upload, 1, new Uint8Array([1, 2]))
    await filesystem.completeMultipart(upload, [part])
    await filesystem.abortMultipart(upload)
    expect(send.mock.calls.map(call => (call[0] as object).constructor)).toEqual([CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand])
  })

  it('passes through native streams and supports visibility and provider checksums', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => new Uint8Array(), transformToWebStream: () => stream } }
      if (command instanceof GetObjectAclCommand) return { Grants: [{ Permission: 'READ', Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' } }] }
      if (command instanceof HeadObjectCommand) return { ChecksumSHA256: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s=' }
      return {}
    })
    const filesystem = new AwsS3Filesystem({ bucket: 'files', client: { send } })

    await expect(filesystem.readStream('a')).resolves.toBe(stream)
    await filesystem.writeStream('b', stream)
    await expect(filesystem.visibility('a')).resolves.toBe('public')
    await filesystem.setVisibility('a', 'private')
    await expect(filesystem.checksum('a')).resolves.toEqual({ algorithm: 'sha256', value: 'ab'.repeat(32) })
    expect(send.mock.calls.some(call => call[0] instanceof PutObjectAclCommand)).toBe(true)
  })
})

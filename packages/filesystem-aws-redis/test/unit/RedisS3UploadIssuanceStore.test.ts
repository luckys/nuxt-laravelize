import { describe, expect, expectTypeOf, it } from 'vitest'
import { S3UploadConfirmationInProgressError, type S3UploadIssuance, type S3UploadIssuanceStore } from '@nuxt-laravelize/filesystem-aws'
import { RedisS3UploadIssuanceCorruptionError, RedisS3UploadIssuanceStore, type RedisS3UploadIssuanceClient } from '../../src'

interface Entry { fields: Record<string, string>, expiresAt: number }

class FakeRedis implements RedisS3UploadIssuanceClient {
  readonly entries = new Map<string, Entry>()
  readonly calls: Array<{ script: string, key: string, args: string[] }> = []
  failExpiry = false

  constructor(public now = 1_000) {}

  async eval(script: string, numberOfKeys: number, ...values: Array<string | number>): Promise<unknown> {
    expect(numberOfKeys).toBe(1)
    const [keyValue, ...argumentValues] = values
    const key = String(keyValue)
    const args = argumentValues.map(String)
    this.calls.push({ script, key, args })
    const existing = this.entries.get(key)
    if (existing && existing.expiresAt <= this.now) this.entries.delete(key)

    if (script.includes('laravelize:s3-upload:save')) {
      if (Number(args[1]) <= this.now) return ['expired']
      if (this.entries.has(key)) return ['exists']
      this.entries.set(key, { fields: { version: '1', state: 'pending', audience: args[0]!, issuance: args[2]!, expiresAt: args[3]! }, expiresAt: Number(args[1]) })
      if (this.failExpiry) {
        this.entries.delete(key)
        throw new Error('ISSUANCE_EXPIRY_FAILED')
      }
      return ['saved']
    }
    const entry = this.entries.get(key)
    if (!entry) return ['missing']
    if (!valid(entry.fields)) return ['corrupt']
    if (script.includes('laravelize:s3-upload:reserve')) {
      if (entry.fields.audience !== args[0]) return ['missing']
      if (entry.fields.state === 'reserved') return ['busy']
      entry.fields.state = 'reserved'
      entry.fields.token = args[1]!
      return ['reserved', entry.fields.issuance]
    }
    if (entry.fields.state !== 'reserved' || entry.fields.token !== args[0]) return ['stale']
    if (script.includes('laravelize:s3-upload:release')) {
      entry.fields.state = 'pending'
      delete entry.fields.token
      return ['released']
    }
    this.entries.delete(key)
    return ['completed']
  }

  corrupt(id: string, fields: Record<string, string>): void {
    this.entries.set(`test:issuance:${id}`, { fields, expiresAt: this.now + 60_000 })
  }
}

function valid(fields: Record<string, string>): boolean {
  const keys = Object.keys(fields)
  if (fields.version !== '1' || !fields.issuance || !fields.expiresAt || fields.audience === undefined) return false
  try {
    JSON.parse(fields.issuance)
  }
  catch { return false }
  if (fields.state === 'pending') return keys.length === 5 && fields.token === undefined
  return fields.state === 'reserved' && keys.length === 6 && Boolean(fields.token)
}

function issuance(overrides: Partial<S3UploadIssuance> = {}): S3UploadIssuance {
  return {
    id: 'grant-1',
    audience: 'tenant:a',
    mimeType: 'text/plain',
    policy: { path: 'uploads/a', keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'actor', tenantId: 'tenant', expiresAt: new Date(61_000).toISOString() },
    ...overrides,
  }
}

describe('RedisS3UploadIssuanceStore', () => {
  it('implements the store with only a structural eval client', () => {
    const store = new RedisS3UploadIssuanceStore(new FakeRedis(), { prefix: 'test:issuance:' })
    expectTypeOf(store).toMatchTypeOf<S3UploadIssuanceStore>()
  })

  it.each(['', 'test', `bad\0:`])('rejects an unsafe key namespace: %s', (prefix) => {
    expect(() => new RedisS3UploadIssuanceStore(new FakeRedis(), { prefix })).toThrow(/prefix/)
  })

  it('uses Redis time and PEXPIREAT and never overwrites a live issuance', async () => {
    const redis = new FakeRedis()
    const store = new RedisS3UploadIssuanceStore(redis, { prefix: 'test:issuance:' })
    await store.save(issuance())
    await expect(store.save(issuance({ audience: 'replacement' }))).rejects.toThrow('already exists')
    expect(redis.calls[0]!.script).toContain('redis.call(\'TIME\')')
    expect(redis.calls[0]!.script).toContain('redis.call(\'PEXPIREAT\'')
    redis.now = 61_001
    await expect(store.save(issuance({ audience: 'replacement', policy: { ...issuance().policy, expiresAt: new Date(120_000).toISOString() } }))).resolves.toBeUndefined()
  })

  it('checks audience before reporting busy and atomically reserves pending state', async () => {
    const redis = new FakeRedis()
    let nextToken = 0
    const store = new RedisS3UploadIssuanceStore(redis, { prefix: 'test:issuance:', tokenFactory: () => `token-${++nextToken}` })
    await store.save(issuance())
    await expect(store.reserve('grant-1', 'tenant:b')).resolves.toBeNull()
    await expect(store.reserve('grant-1', 'tenant:a')).resolves.toMatchObject({ token: 'token-2' })
    await expect(store.reserve('grant-1', 'tenant:b')).resolves.toBeNull()
    await expect(store.reserve('grant-1', 'tenant:a')).rejects.toBeInstanceOf(S3UploadConfirmationInProgressError)
  })

  it('fences release and complete by token while preserving the original TTL', async () => {
    const redis = new FakeRedis()
    let token = 0
    const store = new RedisS3UploadIssuanceStore(redis, { prefix: 'test:issuance:', tokenFactory: () => `token-${++token}` })
    await store.save(issuance())
    const first = await store.reserve('grant-1', 'tenant:a')
    if (!first) throw new Error('Expected reservation.')
    const expiresAt = redis.entries.get('test:issuance:grant-1')!.expiresAt
    await store.release({ ...first, token: 'stale' })
    await expect(store.reserve('grant-1', 'tenant:a')).rejects.toBeInstanceOf(S3UploadConfirmationInProgressError)
    await store.release(first)
    expect(redis.entries.get('test:issuance:grant-1')!.expiresAt).toBe(expiresAt)
    const second = await store.reserve('grant-1', 'tenant:a')
    if (!second) throw new Error('Expected reservation.')
    await expect(store.complete(first)).rejects.toThrow('no longer active')
    await store.complete(second)
    expect(redis.entries.has('test:issuance:grant-1')).toBe(false)
  })

  it('fails closed when persisted state or issuance JSON is corrupt', async () => {
    const redis = new FakeRedis()
    const store = new RedisS3UploadIssuanceStore(redis, { prefix: 'test:issuance:' })
    redis.corrupt('grant-1', { version: '1', state: 'unknown', audience: 'tenant:a', issuance: '{}', expiresAt: issuance().policy.expiresAt })
    await expect(store.reserve('grant-1', 'tenant:a')).rejects.toBeInstanceOf(RedisS3UploadIssuanceCorruptionError)
    redis.corrupt('grant-1', { version: '1', state: 'pending', audience: 'tenant:a', issuance: '{bad', expiresAt: issuance().policy.expiresAt })
    await expect(store.reserve('grant-1', 'tenant:a')).rejects.toBeInstanceOf(RedisS3UploadIssuanceCorruptionError)
    expect(redis.entries.get('test:issuance:grant-1')!.fields.state).toBe('pending')
  })

  it('rejects an issuance already expired according to Redis rather than the client clock', async () => {
    const redis = new FakeRedis(70_000)
    const store = new RedisS3UploadIssuanceStore(redis, { prefix: 'test:issuance:' })
    await expect(store.save(issuance())).rejects.toThrow('expired')
    expect(redis.entries.size).toBe(0)
  })

  it('removes a newly-created issuance when Redis cannot attach its expiry', async () => {
    const redis = new FakeRedis()
    redis.failExpiry = true
    const store = new RedisS3UploadIssuanceStore(redis, { prefix: 'test:issuance:' })

    await expect(store.save(issuance())).rejects.toThrow('ISSUANCE_EXPIRY_FAILED')

    expect(redis.entries.size).toBe(0)
    expect(redis.calls[0]!.script).toContain('redis.call(\'DEL\',KEYS[1])')
  })
})

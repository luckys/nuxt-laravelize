import Redis from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { S3UploadConfirmationInProgressError, type S3UploadIssuance } from '@nuxt-laravelize/filesystem-aws'
import { RedisS3UploadIssuanceCorruptionError, RedisS3UploadIssuanceStore } from '../../src'

const redisUrl = process.env.REDIS_URL
const redisRequired = process.env.FILESYSTEM_AWS_REDIS_REQUIRED === '1'
const clients: Redis[] = []
const prefix = `laravelize:test:s3-issuance:${process.pid}:${Date.now()}:`
let available = false
let first: RedisS3UploadIssuanceStore
let second: RedisS3UploadIssuanceStore

if (!redisUrl && redisRequired) throw new Error('REDIS_URL is required when FILESYSTEM_AWS_REDIS_REQUIRED=1.')

if (redisUrl) {
  const a = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1_000 })
  const b = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1_000 })
  clients.push(a, b)
  try {
    await Promise.all([a.connect(), b.connect()])
    available = true
    first = new RedisS3UploadIssuanceStore(a, { prefix })
    second = new RedisS3UploadIssuanceStore(b, { prefix })
  }
  catch (error) {
    a.disconnect()
    b.disconnect()
    throw new Error(`Redis integration connection failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function issuance(id: string, ttl = 5_000): S3UploadIssuance {
  return {
    id,
    audience: 'tenant:a',
    mimeType: 'text/plain',
    policy: { path: `uploads/${id}`, keyPrefix: 'uploads', maxBytes: 10, mimeTypes: ['text/plain'], checksum: { algorithm: 'sha256', value: 'ab'.repeat(32) }, actorId: 'actor', tenantId: 'tenant', expiresAt: new Date(Date.now() + ttl).toISOString() },
  }
}

describe.skipIf(!available)('RedisS3UploadIssuanceStore integration', () => {
  afterAll(async () => {
    if (available) {
      await clients[0]!.del(`${prefix}atomic`, `${prefix}corrupt`, `${prefix}expires-during-work`)
    }
    await Promise.all(clients.map(async client => client.disconnect()))
  })

  it('coordinates audience-safe fenced reservations and preserves TTL', async () => {
    if (!available) return
    const record = issuance('atomic')
    await first.save(record)
    await expect(second.save(record)).rejects.toThrow('already exists')
    const attempts = await Promise.allSettled([first.reserve(record.id, record.audience), second.reserve(record.id, record.audience)])
    const winner = attempts.find(result => result.status === 'fulfilled' && result.value)?.status === 'fulfilled'
      ? (attempts.find(result => result.status === 'fulfilled' && result.value) as PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof first.reserve>>>>).value
      : null
    expect(winner).not.toBeNull()
    expect(attempts.some(result => result.status === 'rejected' && result.reason instanceof S3UploadConfirmationInProgressError)).toBe(true)
    await expect(first.reserve(record.id, 'tenant:b')).resolves.toBeNull()
    const ttlBefore = await clients[0]!.pttl(`${prefix}${record.id}`)
    await first.release({ ...winner!, token: 'stale' })
    await first.release(winner!)
    const ttlAfter = await clients[0]!.pttl(`${prefix}${record.id}`)
    expect(ttlAfter).toBeGreaterThan(0)
    expect(ttlAfter).toBeLessThanOrEqual(ttlBefore)
    const current = await second.reserve(record.id, record.audience)
    if (!current) throw new Error('Expected a second reservation.')
    await expect(second.complete(winner!)).rejects.toThrow('no longer active')
    await second.complete(current)
  })

  it('fails closed on corruption and when expiry occurs during confirmation work', async () => {
    if (!available) return
    const corruptKey = `${prefix}corrupt`
    await clients[0]!.hset(corruptKey, { version: '1', state: 'pending', audience: 'tenant:a', issuance: '{bad', expiresAt: new Date(Date.now() + 5_000).toISOString() })
    await clients[0]!.pexpire(corruptKey, 5_000)
    await expect(first.reserve('corrupt', 'tenant:a')).rejects.toBeInstanceOf(RedisS3UploadIssuanceCorruptionError)
    expect(await clients[0]!.hget(corruptKey, 'state')).toBe('pending')

    const expiring = issuance('expires-during-work', 80)
    await first.save(expiring)
    const reservation = await first.reserve(expiring.id, expiring.audience)
    if (!reservation) throw new Error('Expected reservation.')
    await new Promise(resolve => setTimeout(resolve, 100))
    await expect(first.complete(reservation)).rejects.toThrow('no longer active')
  })
})

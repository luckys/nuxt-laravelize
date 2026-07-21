import { describe, expect, it } from 'vitest'
import { InMemoryIdempotencyStore } from '../../src/runtime/store'

const input = (token: string, now = 0, fingerprint = 'same') => ({ key: 'key', fingerprint, leaseToken: token, now, leaseMs: 10, retentionMs: 100 })

describe('InMemoryIdempotencyStore conformance', () => {
  it('grants one concurrent owner and reports processing to the other', async () => {
    const store = new InMemoryIdempotencyStore()
    const [first, second] = await Promise.all([store.acquire(input('one')), store.acquire(input('two'))])
    expect([first.outcome, second.outcome].sort()).toEqual(['acquired', 'processing'])
  })

  it('detects fingerprint conflicts and reclaims expired leases', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire(input('old'))
    expect((await store.acquire(input('other', 1, 'different'))).outcome).toBe('conflict')
    expect((await store.acquire(input('new', 10))).outcome).toBe('acquired')
  })

  it('uses the renewable lease, not completed retention, as processing lifetime', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire({ ...input('owner'), leaseMs: 10, retentionMs: 2 })
    expect((await store.acquire(input('other', 3))).outcome).toBe('processing')
    expect(await store.renew('key', 'owner', 8, 10)).toBe(true)
    expect((await store.acquire(input('other', 12))).outcome).toBe('processing')
  })

  it('fences stale owners from renew, completion, and failure', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire(input('old'))
    await store.acquire(input('new', 10))
    expect(await store.renew('key', 'old', 11, 10)).toBe(false)
    expect(await store.complete('key', 'old', { kind: 'json', status: 200, headers: {}, body: {} }, 11, 100)).toBe(false)
    expect(await store.fail('key', 'old', 11, 100)).toBe(false)
  })

  it('replays completed records until retention expires', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire(input('one'))
    await store.complete('key', 'one', { kind: 'json', status: 201, headers: {}, body: { ok: true } }, 1, 100)
    expect((await store.acquire(input('two', 100))).outcome).toBe('replay')
    expect((await store.acquire(input('three', 101))).outcome).toBe('acquired')
  })

  it('supports retained and retryable failure policies', async () => {
    const store = new InMemoryIdempotencyStore()
    await store.acquire(input('one'))
    await store.fail('key', 'one', 1, 100)
    expect((await store.acquire(input('two', 2))).outcome).toBe('failed')
    expect((await store.acquire({ ...input('three', 2), retryFailed: true })).outcome).toBe('acquired')
  })
})

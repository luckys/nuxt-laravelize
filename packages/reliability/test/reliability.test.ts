import { describe, expect, it, vi } from 'vitest'
import { createEnvelope, InboxConsumer, OutboxProcessor } from '../src/index.js'
import { InMemoryReliabilityStore } from '../src/testing.js'

const clock = () => new Date('2026-01-01T00:00:00.000Z')
describe('reliability', () => {
  it('creates a stable JSON envelope and only selects safe context fields', () => {
    const e = createEnvelope({ id: 'm-1', type: 'order.created.v1', occurredAt: clock().toISOString(), payload: { ok: true }, context: { correlationId: 'c-1', secret: 'no' } })
    expect(e).toEqual(expect.objectContaining({ version: 1, context: { correlationId: 'c-1' } }))
    expect(JSON.parse(JSON.stringify(e))).toEqual(e)
  })
  it('claims, retries and eventually marks an outbox message delivered', async () => {
    const store = new InMemoryReliabilityStore()
    const message = createEnvelope({ id: 'm-1', type: 'x.v1', occurredAt: clock().toISOString(), payload: {} })
    await store.append(message)
    const deliver = vi.fn().mockResolvedValueOnce({ ok: false, retryable: true, error: 'busy', retryAt: clock().toISOString() }).mockResolvedValueOnce({ ok: true })
    const processor = new OutboxProcessor(store, deliver, { owner: 'worker-1', clock })
    expect((await processor.runOnce()).retried).toBe(1)
    expect((await processor.runOnce()).delivered).toBe(1)
    expect(store.records.get('outbox:m-1')?.attempts).toBe(2)
  })
  it('deduplicates inbox delivery', async () => {
    const store = new InMemoryReliabilityStore()
    const handle = vi.fn()
    const consumer = new InboxConsumer(store, handle, { owner: 'consumer', clock })
    const message = createEnvelope({ id: 'm-2', type: 'x.v1', occurredAt: clock().toISOString(), payload: null })
    expect(await consumer.consume(message)).toBe('delivered')
    expect(await consumer.consume(message)).toBe('duplicate')
    expect(handle).toHaveBeenCalledOnce()
  })
  it('rejects non-JSON values and bounds the development store', async () => {
    expect(() => createEnvelope({ type: 'x.v1', payload: { value: undefined } as never })).toThrow(/JSON-safe/)
    const store = new InMemoryReliabilityStore(1)
    await store.append(createEnvelope({ id: 'one', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))
    await expect(store.append(createEnvelope({ id: 'two', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))).rejects.toThrow(/capacity/)
  })
  it('reclaims expired leases but not active leases', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'leased', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))
    expect(await store.claim({ owner: 'first', token: 't1', limit: 1, now: clock().toISOString(), leaseUntil: '2026-01-01T00:00:10.000Z' })).toHaveLength(1)
    expect(await store.claim({ owner: 'second', token: 't2', limit: 1, now: '2026-01-01T00:00:05.000Z', leaseUntil: '2026-01-01T00:00:20.000Z' })).toHaveLength(0)
    expect(await store.claim({ owner: 'second', token: 't2', limit: 1, now: '2026-01-01T00:00:11.000Z', leaseUntil: '2026-01-01T00:00:20.000Z' })).toHaveLength(1)
  })
  it('fences stale transitions and namespaces identical inbox/outbox ids', async () => {
    const store = new InMemoryReliabilityStore()
    const message = createEnvelope({ id: 'same', type: 'x.v1', occurredAt: clock().toISOString(), payload: null })
    await store.append(message)
    const [claimed] = await store.claim({ owner: 'worker', token: 'claim', limit: 1, now: clock().toISOString(), leaseUntil: '2026-01-01T00:00:10.000Z' })
    expect(await store.claim(message, { owner: 'consumer', token: 'inbox', now: clock().toISOString(), leaseUntil: '2026-01-01T00:00:10.000Z' })).toEqual(expect.objectContaining({ status: 'claimed' }))
    expect(store.records.has('outbox:same')).toBe(true)
    expect(store.records.has('inbox:same')).toBe(true)
    await expect(store.delivered('outbox', 'same', 'wrong', '2026-01-01T00:00:01.000Z')).rejects.toThrow(/lease/)
    await expect(store.delivered('outbox', 'same', claimed!.leaseToken!, '2026-01-01T00:00:10.000Z')).rejects.toThrow(/lease/)
  })
  it('atomically filters claims by message type', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'other', type: 'other.v1', occurredAt: clock().toISOString(), payload: null }))
    await store.append(createEnvelope({ id: 'wanted', type: 'wanted.v1', occurredAt: clock().toISOString(), payload: null }))
    const claimed = await store.claim({ owner: 'worker', token: 'filter', limit: 10, types: ['wanted.v1'], now: clock().toISOString(), leaseUntil: '2026-01-01T00:00:10.000Z' })
    expect(claimed.map(row => row.envelope.id)).toEqual(['wanted'])
  })
  it('moves terminal outbox and exhausted inbox failures to dead', async () => {
    const outbox = new InMemoryReliabilityStore()
    await outbox.append(createEnvelope({ id: 'dead-out', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))
    const processor = new OutboxProcessor(outbox, async () => ({ ok: false, retryable: false, error: 'invalid' }), { owner: 'worker', clock })
    expect((await processor.runOnce()).dead).toBe(1)
    const inbox = new InMemoryReliabilityStore()
    const consumer = new InboxConsumer(inbox, async () => {
      throw new Error('bad')
    }, { owner: 'consumer', maxAttempts: 1, clock })
    expect(await consumer.consume(createEnvelope({ id: 'dead-in', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))).toBe('dead')
  })
})

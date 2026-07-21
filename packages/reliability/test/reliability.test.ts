import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { createEnvelope, InboxConsumer, OutboxMessageConflictError, OutboxProcessor, OutboxWorker, sanitizeErrorSummary } from '../src/index.js'
import { InMemoryReliabilityStore } from '../src/testing.js'
import { parseOutboxWorkerArgs, runOutboxWorkerCli } from '../src/cli.js'

const clock = () => new Date('2026-01-01T00:00:00.000Z')
describe('reliability', () => {
  it('parses generic worker CLI arguments strictly', () => {
    expect(parseOutboxWorkerArgs(['--once', '--config', './worker.js'])).toEqual({ once: true, help: false, config: './worker.js' })
    expect(() => parseOutboxWorkerArgs(['--unknown'])).toThrow(/Unknown argument/)
  })
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
  it('schedules availability independently from occurrence time', async () => {
    const store = new InMemoryReliabilityStore()
    const message = createEnvelope({ id: 'scheduled', type: 'x.v1', occurredAt: clock().toISOString(), payload: {} })
    await store.append(message, { availableAt: '2026-01-01T00:01:00.000Z' })
    expect(store.records.get('outbox:scheduled')?.availableAt).toBe('2026-01-01T00:01:00.000Z')
    await expect(store.claim({ owner: 'early', token: 'early', limit: 1, now: '2026-01-01T00:00:59.999Z', leaseUntil: '2026-01-01T00:02:00.000Z' })).resolves.toHaveLength(0)
    await expect(store.claim({ owner: 'ready', token: 'ready', limit: 1, now: '2026-01-01T00:01:00.000Z', leaseUntil: '2026-01-01T00:02:00.000Z' })).resolves.toHaveLength(1)
  })
  it('makes identical outbox appends idempotent and rejects changed identities', async () => {
    const store = new InMemoryReliabilityStore()
    const message = createEnvelope({ id: 'stable', type: 'x.v1', occurredAt: clock().toISOString(), payload: { first: 1, second: 2 } })
    await store.append(message, { availableAt: '2026-01-01T00:01:00.000Z' })
    await expect(store.append(message, { availableAt: '2026-01-01T00:01:00.000Z' })).resolves.toBeUndefined()
    await expect(store.append(createEnvelope({ id: 'stable', type: 'x.v1', occurredAt: clock().toISOString(), payload: { second: 2, first: 1 } }), { availableAt: '2026-01-01T00:01:00.000Z' })).resolves.toBeUndefined()
    await expect(store.append(message, { availableAt: '2026-01-01T00:02:00.000Z' })).rejects.toBeInstanceOf(OutboxMessageConflictError)
    await expect(store.append({ ...message, payload: { first: 9, second: 2 } })).rejects.toBeInstanceOf(OutboxMessageConflictError)
    await expect(store.append(message, { availableAt: 'later' })).rejects.toThrow(TypeError)
  })
  it('keeps append identity stable after retry changes delivery availability', async () => {
    const store = new InMemoryReliabilityStore()
    const message = createEnvelope({ id: 'retried-identity', type: 'x.v1', occurredAt: clock().toISOString(), payload: null })
    await store.append(message)
    const [claimed] = await store.claim({ owner: 'worker', token: 'claim', limit: 1, now: clock().toISOString(), leaseUntil: '2026-01-01T00:00:10.000Z' })
    await store.retry('outbox', message.id, claimed!.leaseToken!, '2026-01-01T00:00:01.000Z', '2026-01-01T00:05:00.000Z', 'later')
    await expect(store.append(message)).resolves.toBeUndefined()
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
  it('renews only a current fenced lease', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'renew', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))
    const [row] = await store.claim({ owner: 'worker', token: 'claim', limit: 1, now: clock().toISOString(), leaseUntil: '2026-01-01T00:00:10.000Z' })
    await store.renew('outbox', 'renew', row!.leaseToken!, '2026-01-01T00:00:05.000Z', '2026-01-01T00:00:20.000Z')
    expect(store.records.get('outbox:renew')?.leaseUntil).toBe('2026-01-01T00:00:20.000Z')
    await store.renew('outbox', 'renew', row!.leaseToken!, '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:15.000Z')
    expect(store.records.get('outbox:renew')?.leaseUntil).toBe('2026-01-01T00:00:20.000Z')
    await expect(store.renew('outbox', 'renew', 'stale', '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:30.000Z')).rejects.toThrow(/lease/)
    await expect(store.renew('inbox', 'renew', row!.leaseToken!, '2026-01-01T00:00:06.000Z', '2026-01-01T00:00:30.000Z')).rejects.toThrow(/lease/)
  })
  it('reports delivered-but-ack-unknown without retrying delivery', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'ack', type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))
    const delivered = store.delivered.bind(store)
    store.delivered = vi.fn(async () => {
      throw new Error('database unavailable')
    })
    const delivery = vi.fn(async () => ({ ok: true as const }))
    const result = await new OutboxProcessor(store, delivery, { owner: 'worker', clock }).runOnce()
    expect(result.outcomes).toEqual([{ id: 'ack', status: 'delivered-ack-unknown', error: 'database unavailable' }])
    expect(delivery).toHaveBeenCalledOnce()
    store.delivered = delivered
  })
  it('processes the requested batch in capacity-sized claim chunks', async () => {
    const store = new InMemoryReliabilityStore()
    for (const id of ['a', 'b', 'c']) await store.append(createEnvelope({ id, type: 'x.v1', occurredAt: clock().toISOString(), payload: null }))
    const result = await new OutboxProcessor(store, async () => ({ ok: true }), { owner: 'worker', clock, limit: 10, concurrency: 2 }).runOnce()
    expect(result.claimed).toBe(3)
  })
  it('renews the lease while a long delivery is active', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'long', type: 'x.v1', payload: null }))
    const processor = new OutboxProcessor(store, async () => {
      await new Promise(resolve => setTimeout(resolve, 45))
      return { ok: true }
    }, { owner: 'worker', leaseMs: 24, heartbeatMs: 5 })
    const running = processor.runOnce()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(await store.claim({ owner: 'other', token: 'other', limit: 1, now: new Date().toISOString(), leaseUntil: new Date(Date.now() + 20).toISOString() })).toHaveLength(0)
    expect((await running).delivered).toBe(1)
  })
  it('serializes renewals and waits for renewal before acknowledging', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'serialized', type: 'x.v1', payload: null }))
    const renew = store.renew.bind(store)
    let active = 0
    let maximumActive = 0
    store.renew = vi.fn(async (namespace, id, token, now, leaseUntil) => {
      active++
      maximumActive = Math.max(maximumActive, active)
      await new Promise(resolve => setTimeout(resolve, 8))
      await renew(namespace, id, token, now, leaseUntil)
      active--
    })
    const delivered = vi.spyOn(store, 'delivered')
    const processor = new OutboxProcessor(store, async () => {
      await new Promise(resolve => setTimeout(resolve, 18))
      return { ok: true }
    }, { owner: 'worker', leaseMs: 40, heartbeatMs: 3 })
    expect((await processor.runOnce()).delivered).toBe(1)
    expect(maximumActive).toBe(1)
    expect(active).toBe(0)
    expect(delivered).toHaveBeenCalledOnce()
  })
  it('aborts a handler after heartbeat lease loss', async () => {
    const store = new InMemoryReliabilityStore()
    store.renew = vi.fn(async () => {
      throw new Error('Message lease lost')
    })
    const consumer = new InboxConsumer(store, async (_message, context) => {
      await new Promise<void>(resolve => context!.signal.addEventListener('abort', () => resolve(), { once: true }))
      throw context!.signal.reason
    }, { owner: 'consumer', leaseMs: 20, heartbeatMs: 5 })
    expect(await consumer.consume(createEnvelope({ id: 'lost', type: 'x.v1', payload: null }))).toBe('busy')
  })
  it('cancels active work and drains before stop resolves', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append(createEnvelope({ id: 'cancel', type: 'x.v1', payload: null }))
    let finished = false
    const processor = new OutboxProcessor(store, async (_message, context) => new Promise((_resolve, reject) => context!.signal.addEventListener('abort', () => {
      finished = true
      reject(context!.signal.reason)
    }, { once: true })), { owner: 'worker' })
    const worker = new OutboxWorker(processor)
    const running = worker.run()
    await new Promise(resolve => setTimeout(resolve, 5))
    await worker.stop()
    await running
    expect(finished).toBe(true)
  })
  it('shuts the CLI down once and runs optional cleanup', async () => {
    const signals = new EventEmitter()
    const stop = vi.fn(async () => {})
    const close = vi.fn(async () => {})
    const worker = { run: vi.fn(async (signal: AbortSignal) => new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))), runOnce: vi.fn(), stop, drain: vi.fn(async () => {}) } as unknown as OutboxWorker
    const running = runOutboxWorkerCli({ args: [], signals: signals as never, load: async () => ({ worker, close }) })
    await new Promise(resolve => setTimeout(resolve, 0))
    signals.emit('SIGTERM')
    signals.emit('SIGINT')
    await running
    expect(stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
  it('does not claim when an inbox signal is already aborted', async () => {
    const store = new InMemoryReliabilityStore()
    const claim = vi.spyOn(store, 'claim')
    const controller = new AbortController()
    controller.abort()
    const consumer = new InboxConsumer(store, vi.fn(), { owner: 'consumer', signal: controller.signal })
    expect(await consumer.consume(createEnvelope({ id: 'aborted', type: 'x.v1', payload: null }))).toBe('busy')
    expect(claim).not.toHaveBeenCalled()
  })
  it('bounds payload shape and size without recursive traversal', () => {
    let deep: Record<string, unknown> = {}
    for (let index = 0; index < 40; index++) deep = { child: deep }
    expect(() => createEnvelope({ type: 'deep.v1', payload: deep as never })).toThrow(/structural limits/)
    expect(() => createEnvelope({ type: 'large.v1', payload: 'x'.repeat(65_537) })).toThrow(/too large/)
    expect(() => createEnvelope({ type: 'array.v1', payload: Array.from({ length: 10_001 }, () => null) })).toThrow(/array is too large/)
  })
  it('redacts sensitive error summaries', () => {
    expect(sanitizeErrorSummary('POST https://secret.example token=abc123\nfailed')).toBe('POST [url] token=[redacted] failed')
  })
  it('rejects unsafe processor numeric options', () => {
    const store = new InMemoryReliabilityStore()
    expect(() => new OutboxProcessor(store, async () => ({ ok: true }), { owner: 'x', limit: Number.POSITIVE_INFINITY })).toThrow(/limit/)
    expect(() => new OutboxProcessor(store, async () => ({ ok: true }), { owner: 'x', leaseMs: 10, heartbeatMs: 10 })).toThrow(/heartbeatMs/)
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

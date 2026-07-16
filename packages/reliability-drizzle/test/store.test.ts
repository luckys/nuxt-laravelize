import { describe, expect, it, vi } from 'vitest'
import { DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore } from '../src/index.js'

describe('drizzle reliability stores', () => {
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('uses parameterized transaction-bound append', async (Store) => {
    const database = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    const store = new Store(database)
    await store.appendWith(database, { version: 1, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null })
    expect(database.execute).toHaveBeenCalledOnce()
    expect((database.execute.mock.calls[0]![0] as {
      queryChunks: unknown[]
    }).queryChunks.length).toBeGreaterThan(1)
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('maps JSON text or JSONB objects, freezes them and marks itself durable', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: { nested: true } }
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ envelope, state: 'processing', attempts: 1, available_at: envelope.occurredAt, lease_owner: 'worker', lease_token: 'claim:m-1', lease_until: new Date(1000).toISOString() }] }) }
    const store = new Store(database)
    const claimed = await store.claim({ owner: 'worker', token: 'claim', limit: 1, now: envelope.occurredAt, leaseUntil: new Date(1000).toISOString() })
    expect(claimed[0]?.envelope).toEqual(envelope)
    expect(Object.isFrozen(claimed[0]?.envelope.payload)).toBe(true)
    expect(store.durability).toBe('durable')
  })
})

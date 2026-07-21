import { describe, expect, it, vi } from 'vitest'
import { OutboxMessageConflictError } from '@nuxt-laravelize/reliability'
import { DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore } from '../src/index.js'

describe('drizzle reliability stores', () => {
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('uses parameterized transaction-bound append', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ id: envelope.id }] }) }
    const store = new Store(database)
    await store.appendWith(database, envelope, { availableAt: new Date(1000).toISOString() })
    expect(database.execute).toHaveBeenCalledOnce()
    expect((database.execute.mock.calls[0]![0] as {
      queryChunks: unknown[]
    }).queryChunks.length).toBeGreaterThan(1)
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('appends with the exact unit-of-work session', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-1', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const session = { execute: vi.fn().mockResolvedValue({ rows: [{ id: envelope.id }] }) }
    const store = new Store({ execute: vi.fn() })

    await store.appendIn({ session, afterCommit: vi.fn() }, envelope, { availableAt: new Date(1000).toISOString() })

    expect(session.execute).toHaveBeenCalledOnce()
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('normalizes synchronous execute results', async (Store) => {
    const envelope = { version: 1 as const, id: 'm-sync', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const execute = vi.fn(() => ({ rows: [{ id: envelope.id }] }))
    const store = new Store({ execute })

    await expect(store.append(envelope)).resolves.toBeUndefined()
    expect(execute).toHaveBeenCalledOnce()
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('accepts identical conflicts and rejects changed schedules', async (Store) => {
    const envelope = { version: 1 as const, id: 'same', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const identical = { execute: vi.fn().mockResolvedValue({ rows: [{ id: envelope.id }] }) }
    await expect(new Store(identical).append(envelope)).resolves.toBeUndefined()
    const changed = { execute: vi.fn().mockResolvedValue({ rows: [] }) }
    await expect(new Store(changed).append(envelope)).rejects.toBeInstanceOf(OutboxMessageConflictError)
  })
  it.each([DrizzlePostgresReliabilityStore, DrizzleSQLiteReliabilityStore])('rejects invalid availability before SQL execution', async (Store) => {
    const database = { execute: vi.fn() }
    await expect(new Store(database).append({ version: 1, id: 'bad', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }, { availableAt: 'tomorrow' })).rejects.toThrow(TypeError)
    expect(database.execute).not.toHaveBeenCalled()
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
  it('normalizes PostgreSQL timestamp text returned by the driver', async () => {
    const envelope = { version: 1 as const, id: 'postgres-time', type: 'x.v1', occurredAt: new Date(0).toISOString(), payload: null }
    const database = { execute: vi.fn().mockResolvedValue({ rows: [{ envelope, state: 'processing', attempts: 1, available_at: '1970-01-01 00:00:00.200+00', lease_owner: 'worker', lease_token: 'claim:postgres-time', lease_until: '1970-01-01 00:00:30.200+00' }] }) }

    const claimed = await new DrizzlePostgresReliabilityStore(database).claim({ owner: 'worker', token: 'claim', limit: 1, now: envelope.occurredAt, leaseUntil: new Date(1000).toISOString() })

    expect(claimed[0]).toMatchObject({ availableAt: new Date(200).toISOString(), leaseUntil: new Date(30_200).toISOString() })
  })
})

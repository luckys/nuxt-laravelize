import { describe, expect, it, vi } from 'vitest'
import { DrizzlePostgresAuditStore, DrizzleSQLiteAuditStore, TursoAuditStore } from '../src'
import type { AuditEntry } from '@nuxt-laravelize/audit/runtime'

const entry: AuditEntry = { schemaVersion: 1, id: 'a-1', occurredAt: '2026-01-02T03:04:05.000Z', action: 'patient.viewed', outcome: 'success', target: { type: 'patient', id: 'p-1' }, metadata: { safe: true }, executionId: 'e-1', correlationId: 'c-1', source: { type: 'test' } }
describe('audit stores', () => {
  it.each([DrizzlePostgresAuditStore, DrizzleSQLiteAuditStore])('executes one parameterized insert and exposes no mutations', async (Store) => {
    const database = { execute: vi.fn().mockResolvedValue(undefined) }
    const store = new Store(database)
    await store.append(entry)
    expect(database.execute).toHaveBeenCalledOnce()
    const query = database.execute.mock.calls[0]![0] as { queryChunks: unknown[] }
    expect(query.queryChunks.length).toBeGreaterThan(1)
    expect('update' in store).toBe(false)
    expect('delete' in store).toBe(false)
  })
  it('uses a positional parameterized Turso insert', async () => {
    const client = { execute: vi.fn().mockResolvedValue(undefined) }
    const store = new TursoAuditStore(client)
    await store.append(entry)
    expect(client.execute).toHaveBeenCalledWith(expect.objectContaining({ sql: expect.stringContaining('values (?,?,?,?,?'), args: expect.arrayContaining(['a-1', 'patient.viewed']) }))
    expect(client.execute.mock.calls[0]![0].sql).not.toContain('patient.viewed')
  })
})

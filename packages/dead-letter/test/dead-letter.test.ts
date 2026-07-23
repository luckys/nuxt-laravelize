/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it } from 'vitest'
import { DEAD_LETTER_ABILITIES, DeadLetterAdapterError, DeadLetterAdapterRegistry, DeadLetterManager, DeadLetterOperationConflictError, DeadLetterStaleRevisionError, decodeDeadLetterCursor } from '../src/index.js'
import { MemoryDeadLetterAdapter } from '../src/testing.js'

const item = (id: string, terminalAt: string) => ({ key: { source: 'reliability', namespace: 'outbox', id }, type: 'webhook.deliver.v1', disposition: 'active' as const, attempts: 3, terminalAt, error: 'token=secret\ntrace', revision: '1', payload: { private: true }, tenantHint: 'tenant-1' })
describe('dead-letter manager contract', () => {
  it('fails closed for omitted capabilities and publishes the error-summary ability', () => {
    const memory = new MemoryDeadLetterAdapter('one')
    const registry = new DeadLetterAdapterRegistry().register({ source: 'custom', list: request => memory.list(request), get: (key, options) => memory.get(key, options), retry: request => memory.retry(request), discard: request => memory.discard(request) })
    expect(registry.capabilities('custom')).toEqual({ retry: false, discard: false, scheduleRetry: false })
    expect(DEAD_LETTER_ABILITIES).toContain('dead-letters.view-error-summary')
  })
  it('requires one source, hides payload and qualifies opaque pagination', async () => {
    const registry = new DeadLetterAdapterRegistry().register(new MemoryDeadLetterAdapter('reliability', [item('a', new Date(0).toISOString()), item('b', new Date(1).toISOString())])).register(new MemoryDeadLetterAdapter('bullmq'))
    const manager = new DeadLetterManager(registry)
    await expect(manager.list()).rejects.toThrow('source is required')
    const first = await manager.list({ source: 'reliability', limit: 1 })
    expect(first.items[0]).not.toHaveProperty('payload'); expect(first.items[0]).not.toHaveProperty('tenantHint'); expect(first.items[0]).not.toHaveProperty('error')
    expect((await manager.list({ source: 'reliability', limit: 1, includeErrorSummary: true })).items[0]?.error).toBe('token=[redacted] trace')
    expect((await manager.list({ source: 'reliability', cursor: first.nextCursor, limit: 1 })).items[0]?.key.id).toBe('b')
    expect(() => decodeDeadLetterCursor(first.nextCursor!, 'bullmq')).toThrow(TypeError)
  })
  it('requires payload opt-in and exact revisions; operation replays or conflicts', async () => {
    const adapter = new MemoryDeadLetterAdapter('reliability', [item('a', new Date(0).toISOString())]); const manager = new DeadLetterManager(new DeadLetterAdapterRegistry().register(adapter))
    expect(await manager.get(item('a', '').key)).not.toHaveProperty('payload'); expect(await manager.get(item('a', '').key, { includePayload: true })).toHaveProperty('payload')
    const request = { key: item('a', '').key, revision: '1', operationId: 'operation-1', reason: 'investigated' }
    await expect(manager.discard({ ...request, revision: 'stale', operationId: 'stale-operation' })).rejects.toBeInstanceOf(DeadLetterStaleRevisionError)
    const result = await manager.discard(request); expect(await manager.discard(request)).toEqual(result)
    await expect(manager.discard({ ...request, reason: 'changed' })).rejects.toBeInstanceOf(DeadLetterOperationConflictError)
  })
  it('rejects duplicate and reserved sources and validates mutation bounds', async () => {
    const registry = new DeadLetterAdapterRegistry().register(new MemoryDeadLetterAdapter('one'))
    expect(() => registry.register(new MemoryDeadLetterAdapter('one'))).toThrow('Duplicate')
    expect(() => new DeadLetterAdapterRegistry().register(new MemoryDeadLetterAdapter('all'))).toThrow('reserved')
    expect(() => new DeadLetterManager(registry).retry({ key: { source: 'one', namespace: 'outbox', id: 'x' }, revision: '1', operationId: 'x', availableAt: 'tomorrow' })).toThrow(TypeError)
  })
  it('rejects adapter mutation results with the wrong action disposition', async () => {
    const adapter = new MemoryDeadLetterAdapter('reliability', [item('a', new Date(0).toISOString())])
    adapter.retry = async request => ({ key: request.key, disposition: 'discarded', revision: '2', operationId: request.operationId, committedAt: new Date(0).toISOString() })
    const manager = new DeadLetterManager(new DeadLetterAdapterRegistry().register(adapter))
    await expect(manager.retry({ key: item('a', '').key, revision: '1', operationId: 'wrong-result', availableAt: new Date(0).toISOString() })).rejects.toBeInstanceOf(DeadLetterAdapterError)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createContainer, type Logger } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken, ExecutionContextAccessor } from '@nuxt-laravelize/execution-context/runtime'
import { AuditFake } from '../src/runtime/testing'
import { DefaultAuditRecorder, InMemoryAuditStore, type AuditStore } from '../src/runtime'

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {}, critical() {} }
function recorder(store: AuditStore = new InMemoryAuditStore(), options = {}, logger = silent) {
  const container = createContainer()
  container.instance(executionContextToken, ExecutionContext.create({ executionId: 'exec-1', correlationId: 'corr-1', actor: { type: 'user', id: 'trusted-user' }, tenantId: 'trusted-tenant', source: { type: 'test' } }))
  return { store, value: new DefaultAuditRecorder(store, new ExecutionContextAccessor(container), logger, options, () => 'audit-1', () => new Date('2026-01-02T03:04:05.000Z')) }
}
describe('DefaultAuditRecorder', () => {
  it('enriches trusted context and appends exactly once without accepting spoofed fields', async () => {
    const { store, value } = recorder()
    const entry = await value.record({ action: 'patient.viewed', outcome: 'success', target: { type: 'patient', id: 'p-1' } })
    expect(entry).toMatchObject({ id: 'audit-1', occurredAt: '2026-01-02T03:04:05.000Z', actor: { id: 'trusted-user' }, tenantId: 'trusted-tenant', executionId: 'exec-1' })
    expect((store as InMemoryAuditStore).all()).toHaveLength(1)
  })
  it.each(['actor', 'tenantId', 'executionId', 'id', 'timestamp', 'source', 'unknown'])('rejects reserved or unknown input key %s', async (key) => {
    await expect(recorder().value.record({ action: 'x.done', outcome: 'success', [key]: 'spoof' } as never)).rejects.toThrow('input key')
  })
  it('rejects enumerable symbol input keys', async () => {
    await expect(recorder().value.record({ action: 'x.done', outcome: 'success', [Symbol('hidden')]: true } as never)).rejects.toThrow('symbol')
  })
  it('redacts common and configured secret keys', async () => {
    const { value } = recorder(undefined, { redactionKeys: ['clinicalNote'] })
    const entry = await value.record({ action: 'record.updated', outcome: 'success', metadata: { token: 'x', clinicalNote: 'sensitive', safe: 'ok' }, changes: { password: { from: 'a', to: 'b' } } })
    expect(entry.metadata).toEqual({ token: '[REDACTED]', clinicalNote: '[REDACTED]', safe: 'ok' })
    expect(entry.changes).toEqual({ password: { from: '[REDACTED]', to: '[REDACTED]' } })
  })
  it('requires field-level from/to changes', async () => {
    await expect(recorder().value.record({ action: 'record.updated', outcome: 'failure', changes: { field: { other: true } } as never })).rejects.toThrow('from/to')
  })
  const unsafeValues = [() => ({ fn: () => true }), () => Object.assign(Object.create({}), { x: 1 }), () => {
    const value: Record<string, unknown> = {}
    value.self = value
    return value
  }]
  it.each(unsafeValues)('rejects unsafe JSON values', async make => expect(recorder().value.record({ action: 'unsafe.test', outcome: 'failure', metadata: make() as never })).rejects.toThrow())
  it('enforces depth and serialized size', async () => {
    await expect(recorder(undefined, { maxDepth: 1 }).value.record({ action: 'deep.test', outcome: 'failure', metadata: { a: { b: 1 } } })).rejects.toThrow('depth')
    await expect(recorder(undefined, { maxSerializedBytes: 8 }).value.record({ action: 'large.test', outcome: 'failure', metadata: { safe: 'too large' } })).rejects.toThrow('serialized size')
  })
  it('enforces global traversal budgets against nested arrays', async () => {
    const nested = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'x'))
    await expect(recorder(undefined, { maxNodes: 50, maxArrayElements: 200 }).value.record({ action: 'large.test', outcome: 'failure', metadata: { nested } })).rejects.toThrow('node budget')
    await expect(recorder(undefined, { maxNodes: 500, maxArrayElements: 50 }).value.record({ action: 'large.test', outcome: 'failure', metadata: { nested } })).rejects.toThrow('array element budget')
  })
  it.each([{ maxNodes: 0 }, { maxKeys: Number.POSITIVE_INFINITY }, { maxSerializedBytes: 1.5 }])('rejects invalid limits', (options) => {
    expect(() => recorder(undefined, options)).toThrow('positive integer')
  })
  it('rejects prototype-pollution keys parsed from JSON at every level', async () => {
    const metadata = JSON.parse('{"safe":{"__proto__":{"polluted":true}}}')
    await expect(recorder().value.record({ action: 'unsafe.test', outcome: 'failure', metadata })).rejects.toThrow('reserved audit key')
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })
  it('requires a tenant when configured', async () => {
    const container = createContainer()
    container.instance(executionContextToken, ExecutionContext.create({ executionId: 'exec-1', correlationId: 'corr-1', source: { type: 'test' } }))
    const value = new DefaultAuditRecorder(new InMemoryAuditStore(), new ExecutionContextAccessor(container), silent, { requireTenantId: true })
    await expect(value.record({ action: 'x.done', outcome: 'success' })).rejects.toThrow('tenant')
  })
  it('fails closed by default and logs only sanitized error type in best effort', async () => {
    const failure = { append: vi.fn().mockRejectedValue(new Error('secret payload')) }
    await expect(recorder(failure).value.record({ action: 'store.failed', outcome: 'failure' })).rejects.toThrow('secret payload')
    const logger = { ...silent, error: vi.fn() }
    await expect(recorder(failure, { failureMode: 'best-effort' }, logger).value.record({ action: 'store.failed', outcome: 'failure', metadata: { password: 'never-log' } })).resolves.toBeDefined()
    expect(logger.error).toHaveBeenCalledWith('Audit entry could not be persisted', { errorType: 'Error' })
  })
})
describe('InMemoryAuditStore', () => {
  it('is bounded and fails closed instead of evicting evidence', async () => {
    const store = new InMemoryAuditStore(1)
    await recorder(store).value.record({ action: 'first.done', outcome: 'success' })
    await expect(recorder(store).value.record({ action: 'second.done', outcome: 'success' })).rejects.toThrow('capacity')
    expect(store.all()).toHaveLength(1)
  })
  it('validates capacity', () => expect(() => new InMemoryAuditStore(0)).toThrow('positive integer'))
})
describe('AuditFake', () => {
  it('provides defensive assertions and reset', async () => {
    const fake = new AuditFake()
    const { value } = recorder(fake)
    const entry = await value.record({ action: 'x.done', outcome: 'success' })
    fake.assertCount(1)
    fake.assertRecorded({ action: 'x.done' })
    ;(entry as { action: string }).action = 'mutated'
    fake.assertNotRecorded({ action: 'mutated' })
    fake.reset()
    fake.assertCount(0)
  })
})

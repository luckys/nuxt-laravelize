import { describe, expect, it } from 'vitest'
import { ExecutionContext } from '../src/runtime/ExecutionContext'

describe('ExecutionContext', () => {
  it('validates and derives an immutable child preserving correlation', () => {
    const parent = ExecutionContext.create({ executionId: 'parent', correlationId: 'correlation', source: { type: 'http' }, startedAt: '2020-01-01T00:00:00.000Z', attributes: { safe: 'yes' } })
    const child = parent.derive({ source: { type: 'queue', name: 'EmailJob' } }, () => 'child')
    expect(child.snapshot()).toMatchObject({ version: 1, executionId: 'child', correlationId: 'correlation', causationId: 'parent', source: { type: 'queue', name: 'EmailJob' } })
    expect(() => (child.snapshot().source as { type: string }).type = 'http').not.toThrow()
    expect(child.snapshot().source.type).toBe('queue')
  })

  it('rejects arbitrary objects and bounded attribute violations', () => {
    expect(() => ExecutionContext.create({ source: { type: 'test' }, attributes: Object.create(null) })).toThrow('attributes')
    expect(() => ExecutionContext.create({ source: { type: 'test' }, attributes: { safe: 'x'.repeat(257) } })).toThrow('attribute')
    expect(() => ExecutionContext.create({ source: { type: 'test' }, tenantId: 'contains space' })).toThrow('tenantId')
  })
})

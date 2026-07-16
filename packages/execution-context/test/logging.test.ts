import { describe, expect, it, vi } from 'vitest'
import { fakeExecutionContext } from '../src/testing/index'
import { withExecutionContext } from '../src/runtime/logging'

describe('withExecutionContext', () => {
  it('prevents caller context from replacing trusted execution fields', () => {
    const info = vi.fn()
    const logger = { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn(), critical: vi.fn() }
    withExecutionContext(logger, fakeExecutionContext()).info('message', { correlationId: 'forged', custom: true })
    expect(info).toHaveBeenCalledWith('message', expect.objectContaining({ correlationId: 'test-correlation', custom: true }))
  })
})

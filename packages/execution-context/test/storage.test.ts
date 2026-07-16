import { describe, expect, it } from 'vitest'
import { currentExecutionContextOptional, runWithExecutionContext } from '../src/runtime/server/storage'
import { fakeExecutionContext } from '../src/testing'

describe('execution context storage', () => {
  it('isolates overlapping and delayed operations and restores after rejection', async () => {
    const first = fakeExecutionContext({ executionId: 'first' })
    const second = fakeExecutionContext({ executionId: 'second' })
    const seen = await Promise.all([
      runWithExecutionContext(first, async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return currentExecutionContextOptional()?.snapshot().executionId
      }),
      runWithExecutionContext(second, async () => {
        await Promise.resolve()
        return currentExecutionContextOptional()?.snapshot().executionId
      }),
    ])
    expect(seen).toEqual(['first', 'second'])
    await expect(runWithExecutionContext(first, async () => {
      throw new Error('failed')
    })).rejects.toThrow('failed')
    expect(currentExecutionContextOptional()).toBeUndefined()
  })
})

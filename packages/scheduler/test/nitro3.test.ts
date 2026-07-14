import { describe, expect, it } from 'vitest'
import { defineScheduledOperation } from '../src/nitro3'

describe('Nitro 3 adapter', () => {
  it('adapts an operation using the public task API', async () => {
    const task = defineScheduledOperation('echo', { execute: payload => payload.value })
    await expect(task.run({ name: 'echo', payload: { value: 42 }, context: {} })).resolves.toEqual({ result: 42 })
  })
})

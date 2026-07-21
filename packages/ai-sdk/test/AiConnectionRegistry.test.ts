import { describe, expect, it } from 'vitest'

import { AiConnectionNotFoundError, AiConnectionRegistry } from '../src/runtime/index'

describe('AiConnectionRegistry', () => {
  it('registers connections and merges default capabilities', () => {
    const connection = {
      defaultModel: 'model',
      capabilities: { tools: false },
      model: () => ({}) as never,
    }
    const registry = new AiConnectionRegistry().register('default', connection)

    expect(registry.get('default')).toBe(connection)
    expect(registry.capabilities('default')).toEqual({ streaming: true, structuredOutput: true, tools: false })
  })

  it('rejects unknown connections', () => {
    expect(() => new AiConnectionRegistry().get('missing')).toThrow(AiConnectionNotFoundError)
  })
})

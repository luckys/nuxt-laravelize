import { describe, expect, it } from 'vitest'

import { AiCapabilityNotSupportedError, AiConnectionRegistry, AiSdkClient } from '../src/runtime/index'

describe('AiSdkClient', () => {
  it('fails before calling a connection with an unsupported capability', () => {
    const connections = new AiConnectionRegistry().register('limited', {
      defaultModel: 'model',
      capabilities: { streaming: false },
      model: () => ({}) as never,
    })
    const client = new AiSdkClient(connections, 'limited')

    expect(() => client.stream({ prompt: 'Hello' })).toThrow(AiCapabilityNotSupportedError)
  })
})

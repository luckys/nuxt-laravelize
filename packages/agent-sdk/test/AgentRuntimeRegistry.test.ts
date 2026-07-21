import { describe, expect, it } from 'vitest'
import { AgentRuntimeNotFoundError, AgentRuntimeRegistry } from '../src/runtime'
import { AgentFake } from '../src/runtime/testing'

describe('AgentRuntimeRegistry', () => {
  it('registers named runtimes', () => {
    const fake = new AgentFake()
    expect(new AgentRuntimeRegistry().register('cloudflare', fake).get('cloudflare')).toBe(fake)
  })

  it('rejects unknown runtimes', () => {
    expect(() => new AgentRuntimeRegistry().get('missing')).toThrow(AgentRuntimeNotFoundError)
  })
})

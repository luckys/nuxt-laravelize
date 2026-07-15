import {
  DefaultPolicyRegistry,
  discoverPoliciesByConvention,
  Policy,
  policyRegistryToken,
} from '../../src/public-runtime'
import { describe, expect, it } from 'vitest'

describe('HTTP public runtime', () => {
  it('exports policy authorization APIs', () => {
    expect(Policy).toBeDefined()
    expect(DefaultPolicyRegistry).toBeDefined()
    expect(policyRegistryToken).toBeDefined()
    expect(discoverPoliciesByConvention).toBeTypeOf('function')
  })
})

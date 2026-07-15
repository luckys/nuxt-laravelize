import {
  DefaultPolicyRegistry,
  discoverPoliciesByConvention,
  HmacUrlSigner,
  Policy,
  policyRegistryToken,
  urlSignerToken,
  ValidateSignature,
  validateSignatureToken,
} from '../../src/public-runtime'
import { describe, expect, it } from 'vitest'

describe('HTTP public runtime', () => {
  it('exports policy authorization APIs', () => {
    expect(Policy).toBeDefined()
    expect(DefaultPolicyRegistry).toBeDefined()
    expect(policyRegistryToken).toBeDefined()
    expect(discoverPoliciesByConvention).toBeTypeOf('function')
  })

  it('exports signed URL APIs', () => {
    expect(HmacUrlSigner).toBeDefined()
    expect(ValidateSignature).toBeDefined()
    expect(urlSignerToken).toBeDefined()
    expect(validateSignatureToken).toBeDefined()
  })
})

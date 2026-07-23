import { describe, expect, it } from 'vitest'
import { AuthorizationDeniedError, deny } from '../src/runtime/index'
import { toAuthorizationHttpError } from '../src/runtime/server/toAuthorizationHttpError'

describe('toAuthorizationHttpError', () => {
  it('maps authorization denial to a safe H3 forbidden error', () => {
    expect(toAuthorizationHttpError(new AuthorizationDeniedError(deny('tenant-mismatch', 'private detail')))).toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden',
      data: { code: 'tenant-mismatch' },
    })
  })

  it('does not map unrelated errors', () => {
    expect(toAuthorizationHttpError(new Error('failure'))).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FormRequest } from '../../src/http/FormRequest'

describe('FormRequest', () => {
  it('lets a subclass declare only body', () => {
    class CreateUserRequest extends FormRequest {
      override body() {
        return z.object({ email: z.string().email() })
      }
    }

    const request = new CreateUserRequest()

    expect(request.body).toBeDefined()
    expect(request.query).toBeUndefined()
    expect(request.params).toBeUndefined()
  })

  it('lets a subclass declare only query', () => {
    class ListUsersRequest extends FormRequest {
      override query() {
        return z.object({ page: z.number().int().positive() })
      }
    }

    const request = new ListUsersRequest()

    expect(request.body).toBeUndefined()
    expect(request.query).toBeDefined()
    expect(request.params).toBeUndefined()
  })

  it('lets a subclass declare body and params together', () => {
    class UpdateUserRequest extends FormRequest {
      override body() {
        return z.object({ name: z.string() })
      }

      override params() {
        return z.object({ id: z.string().uuid() })
      }
    }

    const request = new UpdateUserRequest()

    expect(request.body).toBeDefined()
    expect(request.params).toBeDefined()
    expect(request.query).toBeUndefined()
  })

  it('allows a subclass to declare no schemas at all', () => {
    class HealthcheckRequest extends FormRequest {}

    const request = new HealthcheckRequest()

    expect(request.body).toBeUndefined()
    expect(request.query).toBeUndefined()
    expect(request.params).toBeUndefined()
  })
})

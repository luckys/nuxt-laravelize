import { z } from 'zod'

import { FormRequest } from '../../../src/http/FormRequest'

export class CreateUserRequest extends FormRequest {
  override body() {
    return z.object({
      email: z.string().email(),
      name: z.string().min(1),
    })
  }
}

import { z } from 'zod'

import { FormRequest } from '../../../src/http/FormRequest'

export class FindUserRequest extends FormRequest {
  override params() {
    return z.object({ id: z.string() })
  }
}

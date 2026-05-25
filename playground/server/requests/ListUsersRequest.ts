import { z } from 'zod'

import { FormRequest } from '../../../src/http/FormRequest'

export class ListUsersRequest extends FormRequest {
  override query() {
    return z.object({
      page: z.coerce.number().int().positive().default(1),
      per_page: z.coerce.number().int().positive().max(100).default(5),
    })
  }
}

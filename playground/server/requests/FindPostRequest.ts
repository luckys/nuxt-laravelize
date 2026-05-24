import { z } from 'zod'

import { FormRequest } from '../../../src/http/FormRequest'

export class FindPostRequest extends FormRequest {
  override params() {
    return z.object({ id: z.string() })
  }
}

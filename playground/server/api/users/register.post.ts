import { z } from 'zod'

import { defineLaravelizedHandler } from '../../../../src/http/defineLaravelizedHandler'
import { FormRequest } from '../../../../src/http/FormRequest'
import { userControllerToken } from '../../controllers/userTokens'

class RegisterUserRequest extends FormRequest {
  override body() {
    return z.object({ email: z.string().email(), name: z.string().min(1) })
  }
}

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'register',
  request: RegisterUserRequest,
})

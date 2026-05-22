import type { H3Event } from 'h3'
import { z } from 'zod'

import { gateToken } from '../../../src/auth/GateToken'
import { FormRequest } from '../../../src/http/FormRequest'
import { useContainer } from '../../../src/runtime/server/utils/useContainer'

export class CreatePostRequest extends FormRequest {
  override body() {
    return z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    })
  }

  override async authorize(event: H3Event): Promise<boolean> {
    const gate = useContainer(event).make(gateToken)
    const user = event.context.user
    if (!user) return false
    return await gate.allows('create-post', user)
  }
}

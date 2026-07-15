import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { Validator } from '../Validator'
import { validatorToken } from '../tokens'

export { validatorToken } from '../tokens'

export function useValidator(event: H3Event): Validator {
  return useContainer(event).make(validatorToken)
}

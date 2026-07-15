import { createToken } from '@nuxt-laravelize/core/runtime'

import type { Validator } from './Validator'

export const validatorToken = createToken<Validator>('laravelize.validator')

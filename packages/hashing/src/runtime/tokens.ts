import { createToken } from '@nuxt-laravelize/core/runtime'

import type { Hasher } from './Hasher'

export const hasherToken = createToken<Hasher>('laravelize.hasher')

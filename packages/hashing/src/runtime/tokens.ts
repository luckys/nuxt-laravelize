import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { Hasher } from './Hasher'

export const hasherToken = createToken<Hasher>('laravelize.hasher')

import { createToken } from '@nuxt-laravelize/core/runtime'

import type { Cache } from './Cache'

export const cacheToken = createToken<Cache>('laravelize.cache')

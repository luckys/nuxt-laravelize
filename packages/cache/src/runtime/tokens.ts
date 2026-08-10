import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { Cache } from './Cache'

export const cacheToken = createToken<Cache>('laravelize.cache')

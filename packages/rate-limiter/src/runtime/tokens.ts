import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { RateLimiter } from './RateLimiter'

export const rateLimiterToken = createToken<RateLimiter>('laravelize.rateLimiter')

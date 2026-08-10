import type { H3Event } from 'h3'
import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'

import type { RateLimiter } from '../RateLimiter'
import { rateLimiterToken } from '../tokens'

export * from './ThrottleRequests'
export { rateLimiterToken } from '../tokens'

export function useRateLimiter(event: H3Event): RateLimiter {
  return useContainer(event).make(rateLimiterToken)
}

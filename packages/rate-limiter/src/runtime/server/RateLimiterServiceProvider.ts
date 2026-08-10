import { cacheToken } from '@luckys_luis/nuxt-laravelize-cache/runtime'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

import { RateLimiter } from '../RateLimiter'
import { rateLimiterToken } from '../tokens'

export default class RateLimiterServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(rateLimiterToken)) {
      container.singleton(rateLimiterToken, current => new RateLimiter(current.make(cacheToken)))
    }
  }
}

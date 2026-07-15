import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

import { InMemoryCache } from '../InMemoryCache'
import { cacheToken } from '../tokens'

export default class CacheServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(cacheToken)) {
      container.singleton(cacheToken, () => new InMemoryCache())
    }
  }
}

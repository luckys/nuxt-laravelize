import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

import { InMemoryCache } from '../InMemoryCache'
import { cacheToken } from '../tokens'

export default class CacheServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(cacheToken)) {
      container.singleton(cacheToken, () => new InMemoryCache())
    }
  }
}

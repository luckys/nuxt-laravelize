import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

import { Pbkdf2Hasher } from '../Pbkdf2Hasher'
import { hasherToken } from '../tokens'

export default class HashingServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(hasherToken)) {
      container.singleton(hasherToken, () => {
        const config = useRuntimeConfig().laravelizeHashing as { iterations: number }
        return new Pbkdf2Hasher(config.iterations)
      })
    }
  }
}

import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { InMemorySearchEngine, ScoutManager } from '../Scout'
import { scoutManagerToken } from '../tokens'

export default class ScoutServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(scoutManagerToken)) {
      container.singleton(scoutManagerToken, () => {
        const config = useRuntimeConfig().laravelizeScout as { driver?: string }
        return new ScoutManager(config.driver ?? 'memory').extend('memory', () => new InMemorySearchEngine())
      })
    }
  }
}

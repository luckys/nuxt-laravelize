import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { InMemorySearchEngine, ScoutManager } from '../Scout'
import { scoutManagerToken } from '../tokens'

export default class ScoutServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(scoutManagerToken)) container.singleton(scoutManagerToken, () => new ScoutManager(new InMemorySearchEngine()))
  }
}

import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { FeatureManager, InMemoryFeatureStore } from '../Pennant'
import { featureManagerToken } from '../tokens'

export default class PennantServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(featureManagerToken)) container.singleton(featureManagerToken, () => new FeatureManager(new InMemoryFeatureStore()))
  }
}

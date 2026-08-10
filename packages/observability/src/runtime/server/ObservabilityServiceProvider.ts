import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { noopObservability } from '../NoopObservability'
import { observabilityToken } from '../tokens'

export default class ObservabilityServiceProvider implements ServiceProvider {
  register(container: Container): void { if (!container.has(observabilityToken)) container.singleton(observabilityToken, () => noopObservability) }
}

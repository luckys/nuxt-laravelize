import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { noopObservability } from '../NoopObservability'
import { observabilityToken } from '../tokens'

export default class ObservabilityServiceProvider implements ServiceProvider {
  register(container: Container): void { if (!container.has(observabilityToken)) container.singleton(observabilityToken, () => noopObservability) }
}

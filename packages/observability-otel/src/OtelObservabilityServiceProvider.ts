import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'
import { OtelObservability, type OtelObservabilityOptions } from './OtelObservability'

export class OtelObservabilityServiceProvider implements ServiceProvider {
  constructor(private readonly options: OtelObservabilityOptions = {}) {}
  register(container: Container): void { container.singleton(observabilityToken, () => new OtelObservability(this.options)) }
}

import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { observabilityToken } from '@nuxt-laravelize/observability/runtime'
import { OtelObservability, type OtelObservabilityOptions } from './OtelObservability'

export class OtelObservabilityServiceProvider implements ServiceProvider {
  constructor(private readonly options: OtelObservabilityOptions = {}) {}
  register(container: Container): void { container.singleton(observabilityToken, () => new OtelObservability(this.options)) }
}

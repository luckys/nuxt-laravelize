import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { observabilityToken } from '@nuxt-laravelize/observability/runtime'
import { ObservabilityFake } from '@nuxt-laravelize/observability/testing'

export default class FixtureObservabilityServiceProvider implements ServiceProvider {
  register(container: Container): void { container.singleton(observabilityToken, () => new ObservabilityFake()) }
}

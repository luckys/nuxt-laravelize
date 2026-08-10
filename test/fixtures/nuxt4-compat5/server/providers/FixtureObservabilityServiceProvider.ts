import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { observabilityToken } from '@luckys_luis/nuxt-laravelize-observability/runtime'
import { ObservabilityFake } from '@luckys_luis/nuxt-laravelize-observability/testing'

export default class FixtureObservabilityServiceProvider implements ServiceProvider {
  register(container: Container): void { container.singleton(observabilityToken, () => new ObservabilityFake()) }
}

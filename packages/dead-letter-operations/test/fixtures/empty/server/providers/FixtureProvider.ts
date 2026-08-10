import { authorizationToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'

export default class FixtureProvider implements ServiceProvider {
  register(container: Container): void { void container }
  boot(container: Container): void { container.scoped(authorizationToken, () => ({ authorize: async () => ({ allowed: true }), allows: async () => true }) as never) }
}

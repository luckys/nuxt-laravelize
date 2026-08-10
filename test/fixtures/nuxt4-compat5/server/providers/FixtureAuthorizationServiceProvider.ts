import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { AuthorizationRegistry, allow, authorizationRegistryToken, principalResolverToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'

export default class FixtureAuthorizationServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(authorizationRegistryToken, () => new AuthorizationRegistry()
      .registerAbility('health.allow', () => true)
      .registerAbility('health.deny', () => false)
      .registerAbility('health.scope', ({ principal }) => allow({ reason: (principal as { requestId: string }).requestId })))
    container.scoped(principalResolverToken, () => ({ resolve: snapshot => ({ requestId: snapshot.executionId }) }))
  }
}

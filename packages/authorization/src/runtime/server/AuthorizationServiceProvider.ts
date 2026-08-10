import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { Authorization, AuthorizationRegistry, authorizationRegistryToken, authorizationToken, principalResolverToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'

export default class AuthorizationServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(authorizationRegistryToken)) container.singleton(authorizationRegistryToken, () => new AuthorizationRegistry())
    if (!container.has(principalResolverToken)) container.singleton(principalResolverToken, () => ({ resolve: () => null }))
    container.scoped(authorizationToken, resolver => new Authorization(resolver.make(authorizationRegistryToken), () => resolver.make(executionContextToken), () => resolver.make(principalResolverToken)))
  }
}

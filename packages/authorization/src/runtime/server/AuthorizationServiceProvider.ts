import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { Authorization } from '../Authorization'
import { AuthorizationRegistry } from '../AuthorizationRegistry'
import { authorizationRegistryToken, authorizationToken, principalResolverToken } from '../tokens'

export default class AuthorizationServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(authorizationRegistryToken)) container.singleton(authorizationRegistryToken, () => new AuthorizationRegistry())
    if (!container.has(principalResolverToken)) container.singleton(principalResolverToken, () => ({ resolve: () => null }))
    container.scoped(authorizationToken, resolver => new Authorization(resolver.make(authorizationRegistryToken), () => resolver.make(executionContextToken), resolver.make(principalResolverToken)))
  }
}

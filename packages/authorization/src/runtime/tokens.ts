import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Authorization } from './Authorization'
import type { AuthorizationRegistry } from './AuthorizationRegistry'
import type { PrincipalResolver } from './types'

export const authorizationRegistryToken = createToken<AuthorizationRegistry>('laravelize.authorization.registry')
export const authorizationToken = createToken<Authorization>('laravelize.authorization')
export const principalResolverToken = createToken<PrincipalResolver>('laravelize.authorization.principal-resolver')

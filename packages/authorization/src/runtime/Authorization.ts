import type { ExecutionContext, ExecutionContextSnapshot } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'
import { AbilityNotDefinedError, AuthorizationDeniedError } from './errors'
import type { AuthorizationRegistry } from './AuthorizationRegistry'
import { decision, deny, resolvePrincipal, resolveTrustedQueueContext, type AuthorizationContext, type AuthorizationDecision, type DecisionInput, type PrincipalResolver } from './types'

export interface InspectOptions { readonly resourceType?: string, readonly resource?: unknown, readonly args?: readonly unknown[] }
export type ExecutionContextProvider = () => ExecutionContext
export type PrincipalResolverProvider = () => PrincipalResolver
function immutableSnapshot(context: ExecutionContext): ExecutionContextSnapshot {
  const snapshot = context.snapshot()
  return Object.freeze({
    ...snapshot,
    source: Object.freeze(snapshot.source),
    ...(snapshot.actor ? { actor: Object.freeze(snapshot.actor) } : {}),
    ...(snapshot.attributes ? { attributes: Object.freeze(snapshot.attributes) } : {}),
  })
}
export class Authorization {
  private readonly executionContextProvider: ExecutionContextProvider
  private readonly principalResolverProvider: PrincipalResolverProvider

  constructor(private readonly registry: AuthorizationRegistry, executionContext: ExecutionContext | ExecutionContextProvider, principalResolver: PrincipalResolver | PrincipalResolverProvider) {
    this.executionContextProvider = typeof executionContext === 'function' ? executionContext : () => executionContext
    this.principalResolverProvider = typeof principalResolver === 'function' ? principalResolver : () => principalResolver
  }

  async inspect(ability: string, options: InspectOptions = {}): Promise<AuthorizationDecision> {
    if (options.resource !== undefined && options.resourceType === undefined) throw new TypeError('Authorization resourceType is required when resource is provided')
    const snapshot = immutableSnapshot(this.executionContextProvider())
    const queue = snapshot.source.type === 'queue'
    if (!queue && !snapshot.actor) return deny('unauthenticated')
    const resolution = await this.principalResolverProvider().resolve(snapshot)
    const trustedQueueContext = queue ? resolveTrustedQueueContext(resolution) : null
    if (queue && !trustedQueueContext) return deny(resolution != null && resolvePrincipal(resolution, true) != null ? 'untrusted-queue-identity' : resolution != null ? 'untrusted-queue-principal' : 'principal-not-found')
    const principal = queue ? trustedQueueContext!.principal : resolvePrincipal(resolution, false)
    if (principal == null) return deny('principal-not-found')
    const context: AuthorizationContext = trustedQueueContext ?? { principal, actor: snapshot.actor!, ...(snapshot.tenantId ? { tenantId: snapshot.tenantId } : {}) }
    const args = options.args ?? []
    if (options.resourceType !== undefined) {
      if (ability === 'before') throw new AbilityNotDefinedError(ability)
      const policy = this.registry.policy(options.resourceType)
      if (!policy) throw new AbilityNotDefinedError(ability)
      const action = Object.hasOwn(policy, ability) ? policy[ability] : undefined
      if (typeof action !== 'function') throw new AbilityNotDefinedError(ability)
      if (Object.hasOwn(policy, 'before') && policy.before) {
        const before = await policy.before(context, ability, options.resource, ...args)
        if (before !== null && before !== undefined) return decision(before)
      }
      return decision(await (action as (...values: readonly unknown[]) => DecisionInput | Promise<DecisionInput>).call(policy, context, options.resource, ...args))
    }
    const handler = this.registry.ability(ability)
    if (!handler) throw new AbilityNotDefinedError(ability)
    return decision(await handler(context, ...args))
  }

  async allows(ability: string, options?: InspectOptions): Promise<boolean> { return (await this.inspect(ability, options)).allowed }
  async denies(ability: string, options?: InspectOptions): Promise<boolean> { return !(await this.allows(ability, options)) }
  async authorize(ability: string, options?: InspectOptions): Promise<AuthorizationDecision> {
    const result = await this.inspect(ability, options)
    if (!result.allowed) throw new AuthorizationDeniedError(result)
    return result
  }

  async any(abilities: readonly string[], options?: InspectOptions): Promise<boolean> {
    for (const ability of abilities) {
      if (await this.allows(ability, options)) return true
    }
    return false
  }

  async none(abilities: readonly string[], options?: InspectOptions): Promise<boolean> { return !(await this.any(abilities, options)) }
  usesRegistry(registry: AuthorizationRegistry): boolean { return this.registry === registry }
}

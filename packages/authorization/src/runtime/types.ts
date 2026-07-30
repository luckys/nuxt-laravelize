import type { Actor, ExecutionContextSnapshot } from '@nuxt-laravelize/execution-context/runtime'

export type AuthorizationDecision
  = | Readonly<{ allowed: true, code?: string, reason?: string }>
    | Readonly<{ allowed: false, code: string, reason?: string }>

export interface AuthorizationContext<Principal = unknown> {
  readonly principal: Principal
  readonly actor: Actor
  readonly tenantId?: string
}

export type DecisionInput = AuthorizationDecision | boolean
export type AbilityHandler<Principal = unknown> = (context: AuthorizationContext<Principal>, ...args: readonly unknown[]) => DecisionInput | Promise<DecisionInput>
export interface Policy<Principal = unknown, Resource = unknown> {
  before?(context: AuthorizationContext<Principal>, ability: string, resource: Resource, ...args: readonly unknown[]): DecisionInput | null | undefined | Promise<DecisionInput | null | undefined>
  [ability: string]: unknown
}
const QUEUE_PRINCIPAL_TRUST = Symbol('laravelize.authorization.queue-principal-trust')
export interface TrustedQueuePrincipalResolution<Principal = unknown> {
  readonly principal: Principal
  readonly actor?: Actor
  readonly tenantId?: string
  readonly [QUEUE_PRINCIPAL_TRUST]: true
}
export interface TrustedQueueIdentity { readonly actor: Actor, readonly tenantId?: string }
export function trustQueuePrincipal<Principal>(principal: Principal, identity?: TrustedQueueIdentity): TrustedQueuePrincipalResolution<Principal> {
  if (principal == null) throw new TypeError('Trusted queue principal is required')
  const trustedIdentity = identity === undefined ? undefined : validateTrustedIdentity(identity)
  return Object.freeze({ principal, ...(trustedIdentity ? { actor: trustedIdentity.actor } : {}), ...(trustedIdentity?.tenantId ? { tenantId: trustedIdentity.tenantId } : {}), [QUEUE_PRINCIPAL_TRUST]: true as const })
}
export function resolvePrincipal<Principal>(resolution: Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined, queue: boolean): Principal | null {
  if (resolution == null) return null
  const trusted = trustedQueueResolution(resolution)
  if (trusted) return trusted.principal
  return queue ? null : resolution as Principal
}

export function resolveTrustedQueueContext<Principal>(resolution: Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined): AuthorizationContext<Principal> | null {
  if (resolution == null) return null
  const trusted = trustedQueueResolution<Principal>(resolution)
  if (!trusted?.actor) return null
  return Object.freeze({ principal: trusted.principal, actor: trusted.actor, ...(trusted.tenantId ? { tenantId: trusted.tenantId } : {}) })
}
export interface PrincipalResolver<Principal = unknown> {
  resolve(context: ExecutionContextSnapshot): Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined | Promise<Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined>
}

function trustedQueueResolution<Principal>(resolution: Principal | TrustedQueuePrincipalResolution<Principal>): TrustedQueuePrincipalResolution<Principal> | null {
  if (typeof resolution !== 'object' || resolution === null || !Object.prototype.hasOwnProperty.call(resolution, QUEUE_PRINCIPAL_TRUST)) return null
  const value = resolution as Record<PropertyKey, unknown>
  const keys = Reflect.ownKeys(value)
  const principal = Object.getOwnPropertyDescriptor(value, 'principal')
  const actor = Object.getOwnPropertyDescriptor(value, 'actor')
  const tenantId = Object.getOwnPropertyDescriptor(value, 'tenantId')
  const brand = Object.getOwnPropertyDescriptor(value, QUEUE_PRINCIPAL_TRUST)
  const data = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => Boolean(descriptor && 'value' in descriptor && descriptor.enumerable && !descriptor.writable && !descriptor.configurable)
  const allowedKeys: PropertyKey[] = ['principal', QUEUE_PRINCIPAL_TRUST, ...(actor ? ['actor'] : []), ...(tenantId ? ['tenantId'] : [])]
  if (Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value) || !data(principal) || principal.value == null || !data(brand) || brand.value !== true || keys.length !== allowedKeys.length || keys.some(key => !allowedKeys.includes(key))) throw new TypeError('Invalid trusted queue principal resolution')
  if (actor && (!data(actor) || !validFrozenActor(actor.value))) throw new TypeError('Invalid trusted queue principal resolution')
  if (tenantId && (!data(tenantId) || !validIdentityId(tenantId.value))) throw new TypeError('Invalid trusted queue principal resolution')
  return value as unknown as TrustedQueuePrincipalResolution<Principal>
}

const validIdentityId = (value: unknown): value is string => typeof value === 'string' && /^\w[\w.:-]{0,127}$/.test(value)
const immutableData = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => Boolean(descriptor && 'value' in descriptor && descriptor.enumerable && !descriptor.writable && !descriptor.configurable)
function validFrozenActor(value: unknown): value is Actor {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value) || Reflect.ownKeys(value).length !== 2) return false
  const type = Object.getOwnPropertyDescriptor(value, 'type')
  const id = Object.getOwnPropertyDescriptor(value, 'id')
  return immutableData(type) && ['user', 'service', 'system'].includes(type.value as string) && immutableData(id) && validIdentityId(id.value)
}
function validateTrustedIdentity(value: TrustedQueueIdentity): TrustedQueueIdentity {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Invalid trusted queue identity')
  const keys = Reflect.ownKeys(value)
  const actorDescriptor = Object.getOwnPropertyDescriptor(value, 'actor')
  const tenantDescriptor = Object.getOwnPropertyDescriptor(value, 'tenantId')
  if (!actorDescriptor || !('value' in actorDescriptor) || keys.some(key => key !== 'actor' && key !== 'tenantId') || keys.length !== (tenantDescriptor ? 2 : 1)) throw new TypeError('Invalid trusted queue identity')
  const actorValue = actorDescriptor.value
  if (!actorValue || typeof actorValue !== 'object' || Object.getPrototypeOf(actorValue) !== Object.prototype || Reflect.ownKeys(actorValue).length !== 2) throw new TypeError('Invalid trusted queue actor')
  const type = Object.getOwnPropertyDescriptor(actorValue, 'type')
  const id = Object.getOwnPropertyDescriptor(actorValue, 'id')
  if (!type || !('value' in type) || !['user', 'service', 'system'].includes(type.value as string) || !id || !('value' in id) || !validIdentityId(id.value)) throw new TypeError('Invalid trusted queue actor')
  if (tenantDescriptor && (!('value' in tenantDescriptor) || !validIdentityId(tenantDescriptor.value))) throw new TypeError('Invalid trusted queue tenant')
  return Object.freeze({ actor: Object.freeze({ type: type.value as Actor['type'], id: id.value }), ...(tenantDescriptor ? { tenantId: tenantDescriptor.value as string } : {}) })
}

const CODE = /^[a-z][a-z0-9._:-]{0,63}$/
function boundedCode(value: string | undefined, required = false): string | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || !CODE.test(value)) throw new TypeError('Invalid authorization decision code')
  return value
}
function boundedReason(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[\r\n\0]/.test(value)) throw new TypeError('Invalid authorization decision reason')
  return value
}
export function allow(options: { code?: string, reason?: string } = {}): AuthorizationDecision {
  return Object.freeze({ allowed: true, ...(boundedCode(options.code) ? { code: options.code } : {}), ...(boundedReason(options.reason) ? { reason: options.reason } : {}) })
}
export function deny(code = 'forbidden', reason?: string): AuthorizationDecision {
  return Object.freeze({ allowed: false, code: boundedCode(code, true)!, ...(boundedReason(reason) ? { reason } : {}) })
}
export function decision(input: DecisionInput): AuthorizationDecision {
  if (typeof input === 'boolean') return input ? allow() : deny()
  if (typeof input !== 'object' || input === null || Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError('Invalid authorization decision')
  const value = input as Record<string, unknown>
  if (value.allowed !== true && value.allowed !== false) throw new TypeError('Invalid authorization decision allowed value')
  const allowedKeys = ['allowed', 'code', 'reason']
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowedKeys.includes(key))) throw new TypeError('Invalid authorization decision property')
  if (value.code !== undefined && typeof value.code !== 'string') throw new TypeError('Invalid authorization decision code')
  if (value.reason !== undefined && typeof value.reason !== 'string') throw new TypeError('Invalid authorization decision reason')
  if (value.allowed === false && value.code === undefined) throw new TypeError('Invalid authorization decision code')
  return value.allowed ? allow({ code: value.code as string | undefined, reason: value.reason as string | undefined }) : deny(value.code as string, value.reason as string | undefined)
}

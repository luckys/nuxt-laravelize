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
  readonly [QUEUE_PRINCIPAL_TRUST]: true
}
export function trustQueuePrincipal<Principal>(principal: Principal): TrustedQueuePrincipalResolution<Principal> {
  if (principal == null) throw new TypeError('Trusted queue principal is required')
  return Object.freeze({ principal, [QUEUE_PRINCIPAL_TRUST]: true as const })
}
export function resolvePrincipal<Principal>(resolution: Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined, queue: boolean): Principal | null {
  if (resolution == null) return null
  if (typeof resolution === 'object' && Object.prototype.hasOwnProperty.call(resolution, QUEUE_PRINCIPAL_TRUST)) {
    const value = resolution as Record<PropertyKey, unknown>
    const keys = Reflect.ownKeys(value)
    const principal = Object.getOwnPropertyDescriptor(value, 'principal')
    const brand = Object.getOwnPropertyDescriptor(value, QUEUE_PRINCIPAL_TRUST)
    const isFrozenDataProperty = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } => Boolean(descriptor && 'value' in descriptor && descriptor.enumerable && !descriptor.writable && !descriptor.configurable)
    if (Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value) || !isFrozenDataProperty(principal) || principal.value == null || !isFrozenDataProperty(brand) || brand.value !== true || keys.length !== 2 || !keys.includes('principal') || !keys.includes(QUEUE_PRINCIPAL_TRUST)) throw new TypeError('Invalid trusted queue principal resolution')
    return principal.value as Principal
  }
  return queue ? null : resolution as Principal
}
export interface PrincipalResolver<Principal = unknown> {
  resolve(context: ExecutionContextSnapshot): Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined | Promise<Principal | TrustedQueuePrincipalResolution<Principal> | null | undefined>
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

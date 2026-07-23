import { DuplicateAbilityError, DuplicateResourceTypeError } from './errors'
import type { AbilityHandler, Policy } from './types'

const KEY = /^[a-z][a-z0-9._:-]{0,127}$/
function key(value: string, kind: string): string {
  if (!KEY.test(value)) throw new TypeError(`Invalid authorization ${kind}`)
  return value
}

export class AuthorizationRegistry {
  readonly #abilities = new Map<string, AbilityHandler>()
  readonly #policies = new Map<string, Policy>()
  registerAbility(name: string, handler: AbilityHandler): this {
    key(name, 'ability')
    if (typeof handler !== 'function') throw new TypeError('Invalid authorization ability handler')
    if (this.#abilities.has(name)) throw new DuplicateAbilityError(name)
    this.#abilities.set(name, handler)
    return this
  }

  registerResourceType(resourceType: string, policy: Policy): this {
    key(resourceType, 'resource type')
    if (this.#policies.has(resourceType)) throw new DuplicateResourceTypeError(resourceType)
    if (typeof policy !== 'object' || policy === null || ![Object.prototype, null].includes(Object.getPrototypeOf(policy))) throw new TypeError('Invalid authorization policy')
    const compiled = Object.create(null) as Policy
    for (const property of Reflect.ownKeys(policy)) {
      if (typeof property !== 'string') throw new TypeError('Invalid authorization policy action')
      if (property !== 'before') key(property, 'ability')
      const descriptor = Object.getOwnPropertyDescriptor(policy, property)!
      if (!('value' in descriptor) || typeof descriptor.value !== 'function') throw new TypeError(`Invalid authorization policy ${property === 'before' ? 'before hook' : 'action'}`)
      Object.defineProperty(compiled, property, { value: descriptor.value, enumerable: true, writable: false, configurable: false })
    }
    this.#policies.set(resourceType, Object.freeze(compiled))
    return this
  }

  ability(name: string): AbilityHandler | undefined { return this.#abilities.get(name) }
  policy(resourceType: string): Policy | undefined { return this.#policies.get(resourceType) }
  abilities(): readonly string[] { return [...this.#abilities.keys()] }
  resourceTypes(): readonly string[] { return [...this.#policies.keys()] }
}

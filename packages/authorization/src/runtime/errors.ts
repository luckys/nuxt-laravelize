import type { AuthorizationDecision } from './types'

export class AuthorizationDeniedError extends Error {
  readonly decision: AuthorizationDecision
  constructor(decision: AuthorizationDecision) {
    super('This action is unauthorized.')
    this.name = 'AuthorizationDeniedError'
    this.decision = decision
  }
}
export class AbilityNotDefinedError extends Error {
  constructor(ability: string) {
    super(`Authorization ability "${ability}" is not defined.`)
    this.name = 'AbilityNotDefinedError'
  }
}
export class DuplicateAbilityError extends Error {
  constructor(ability: string) {
    super(`Authorization ability "${ability}" is already registered.`)
    this.name = 'DuplicateAbilityError'
  }
}
export class DuplicateResourceTypeError extends Error {
  constructor(resourceType: string) {
    super(`Authorization resource type "${resourceType}" is already registered.`)
    this.name = 'DuplicateResourceTypeError'
  }
}

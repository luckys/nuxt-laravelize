import type { Policy } from './Policy'

export interface PolicyRegistry {
  register(modelName: string, policy: Policy): void
  resolve(modelName: string): Policy | null
  list(): readonly string[]
}

export class DefaultPolicyRegistry implements PolicyRegistry {
  readonly #policies = new Map<string, Policy>()

  register(modelName: string, policy: Policy): void {
    this.#policies.set(modelName, policy)
  }

  resolve(modelName: string): Policy | null {
    return this.#policies.get(modelName) ?? null
  }

  list(): readonly string[] {
    return [...this.#policies.keys()]
  }
}

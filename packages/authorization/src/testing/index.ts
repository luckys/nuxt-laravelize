import type { InspectOptions } from '../runtime/Authorization'
import { AuthorizationDeniedError } from '../runtime/errors'
import { allow, deny, type AuthorizationDecision } from '../runtime/types'

export class AuthorizationFake {
  readonly calls: Array<{ ability: string, options?: InspectOptions }> = []
  readonly #decisions = new Map<string, AuthorizationDecision>()
  allow(ability: string): this {
    this.#decisions.set(ability, allow())
    return this
  }

  deny(ability: string, code = 'forbidden'): this {
    this.#decisions.set(ability, deny(code))
    return this
  }

  async inspect(ability: string, options?: InspectOptions): Promise<AuthorizationDecision> {
    this.calls.push({ ability, ...(options ? { options } : {}) })
    return this.#decisions.get(ability) ?? deny()
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
}

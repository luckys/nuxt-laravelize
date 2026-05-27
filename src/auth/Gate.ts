import type { Policy } from './Policy'
import type { PolicyRegistry } from './PolicyRegistry'
import { GateRuleNotDefinedError } from './GateRuleNotDefinedError'

export type GateCallback = (...args: readonly unknown[]) => boolean | Promise<boolean>

export interface Gate {
  define(rule: string, callback: GateCallback): void
  allows(rule: string, ...args: readonly unknown[]): Promise<boolean>
  denies(rule: string, ...args: readonly unknown[]): Promise<boolean>
}

export class InMemoryGate implements Gate {
  readonly #rules = new Map<string, GateCallback>()
  readonly #policyRegistry: PolicyRegistry | null

  constructor(policyRegistry?: PolicyRegistry | null) {
    this.#policyRegistry = policyRegistry ?? null
  }

  define(rule: string, callback: GateCallback): void {
    this.#rules.set(rule, callback)
  }

  async allows(rule: string, ...args: readonly unknown[]): Promise<boolean> {
    const policyResult = await this.#tryPolicy(rule, args)
    if (policyResult !== undefined) return policyResult

    const callback = this.#rules.get(rule)
    if (!callback) throw new GateRuleNotDefinedError(rule)
    return await callback(...args)
  }

  async denies(rule: string, ...args: readonly unknown[]): Promise<boolean> {
    return !(await this.allows(rule, ...args))
  }

  async #tryPolicy(rule: string, args: readonly unknown[]): Promise<boolean | undefined> {
    if (this.#policyRegistry === null || args.length < 2) return undefined
    const model = args[args.length - 1]
    if (model === null || typeof model !== 'object') return undefined
    const modelName = (model as { constructor?: { name: string } }).constructor?.name
    if (modelName === undefined || modelName === 'Object') return undefined

    const policy = this.#policyRegistry.resolve(modelName)
    if (policy === null) return undefined

    const user = args[0]
    if (policy.before !== undefined) {
      const beforeResult = await policy.before(user)
      if (beforeResult === true || beforeResult === false) return beforeResult
    }

    const action = (policy as unknown as Record<string, unknown>)[rule]
    if (typeof action !== 'function') return undefined
    return await (action as (...a: readonly unknown[]) => boolean | Promise<boolean>).call(policy, ...args)
  }
}

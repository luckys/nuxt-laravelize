import { GateRuleNotDefinedError } from './GateRuleNotDefinedError'

export type GateCallback = (...args: readonly unknown[]) => boolean | Promise<boolean>

export interface Gate {
  define(rule: string, callback: GateCallback): void
  allows(rule: string, ...args: readonly unknown[]): Promise<boolean>
  denies(rule: string, ...args: readonly unknown[]): Promise<boolean>
}

export class InMemoryGate implements Gate {
  readonly #rules = new Map<string, GateCallback>()

  define(rule: string, callback: GateCallback): void {
    this.#rules.set(rule, callback)
  }

  async allows(rule: string, ...args: readonly unknown[]): Promise<boolean> {
    const callback = this.#rules.get(rule)
    if (!callback) throw new GateRuleNotDefinedError(rule)
    return await callback(...args)
  }

  async denies(rule: string, ...args: readonly unknown[]): Promise<boolean> {
    return !(await this.allows(rule, ...args))
  }
}

export class GateRuleNotDefinedError extends Error {
  constructor(rule: string) {
    super(`Gate rule "${rule}" is not defined.`)
    this.name = 'GateRuleNotDefinedError'
  }
}

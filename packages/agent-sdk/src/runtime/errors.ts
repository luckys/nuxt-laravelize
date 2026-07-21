export class AgentRuntimeNotFoundError extends Error {
  constructor(name: string) {
    super(`Agent runtime "${name}" is not registered.`)
    this.name = 'AgentRuntimeNotFoundError'
  }
}

export class AgentCapabilityNotSupportedError extends Error {
  constructor(runtime: string, capability: string) {
    super(`Agent runtime "${runtime}" does not support ${capability}.`)
    this.name = 'AgentCapabilityNotSupportedError'
  }
}

export class AgentFakeResponseMissingError extends Error {
  constructor() {
    super('No fake agent response was queued.')
    this.name = 'AgentFakeResponseMissingError'
  }
}

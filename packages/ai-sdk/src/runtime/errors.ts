export class AiConnectionNotFoundError extends Error {
  constructor(connection: string) {
    super(`AI connection "${connection}" is not registered.`)
    this.name = 'AiConnectionNotFoundError'
  }
}

export class AiCapabilityNotSupportedError extends Error {
  constructor(connection: string, capability: string) {
    super(`AI connection "${connection}" does not support ${capability}.`)
    this.name = 'AiCapabilityNotSupportedError'
  }
}

export class AiFakeResponseMissingError extends Error {
  constructor() {
    super('AiFake has no response queued for this request.')
    this.name = 'AiFakeResponseMissingError'
  }
}

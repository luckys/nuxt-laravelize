export class JobNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Job "${name}" is not registered in the JobRegistry.`)
    this.name = 'JobNotRegisteredError'
  }
}

export class EventNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Event "${name}" is not registered in the JobRegistry.`)
    this.name = 'EventNotRegisteredError'
  }
}

export class BullMQNotInstalledError extends Error {
  constructor() {
    super('bullmq driver requires the bullmq + ioredis packages installed as peer dependencies.')
    this.name = 'BullMQNotInstalledError'
  }
}

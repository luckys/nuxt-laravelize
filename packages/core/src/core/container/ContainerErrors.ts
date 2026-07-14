export class ServiceNotRegisteredError extends Error {
  constructor(serviceKey: string) {
    super(`Service not registered: "${serviceKey}"`)
    this.name = 'ServiceNotRegisteredError'
  }
}

export class CircularDependencyError extends Error {
  constructor(details: string) {
    super(`Circular dependency detected: ${details}`)
    this.name = 'CircularDependencyError'
  }
}

export class ContainerNotAvailableError extends Error {
  constructor() {
    super('Laravelize container is not available in this context')
    this.name = 'ContainerNotAvailableError'
  }
}

export class ProviderBootError extends Error {
  constructor(providerName: string, cause: unknown) {
    super(`Service provider "${providerName}" failed during boot`, { cause })
    this.name = 'ProviderBootError'
  }
}

export class KernelAlreadyBootedError extends Error {
  constructor() {
    super('Cannot register services after the kernel has booted')
    this.name = 'KernelAlreadyBootedError'
  }
}

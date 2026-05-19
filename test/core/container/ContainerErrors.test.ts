import { describe, expect, it } from 'vitest'

import {
  CircularDependencyError,
  ContainerNotAvailableError,
  KernelAlreadyBootedError,
  ProviderBootError,
  ServiceNotRegisteredError,
} from '../../../src/core/container/ContainerErrors'

describe('container errors', () => {
  it('ServiceNotRegisteredError includes the service key', () => {
    const error = new ServiceNotRegisteredError('mailer')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ServiceNotRegisteredError')
    expect(error.message).toContain('mailer')
  })

  it('CircularDependencyError includes the resolution details', () => {
    const error = new CircularDependencyError('a -> b -> a')

    expect(error.name).toBe('CircularDependencyError')
    expect(error.message).toContain('a -> b -> a')
  })

  it('ContainerNotAvailableError has a descriptive message', () => {
    const error = new ContainerNotAvailableError()

    expect(error.name).toBe('ContainerNotAvailableError')
    expect(error.message).toContain('not available')
  })

  it('ProviderBootError keeps the provider name and the original cause', () => {
    const cause = new Error('connection refused')
    const error = new ProviderBootError('DatabaseServiceProvider', cause)

    expect(error.name).toBe('ProviderBootError')
    expect(error.message).toContain('DatabaseServiceProvider')
    expect(error.cause).toBe(cause)
  })

  it('KernelAlreadyBootedError has a descriptive message', () => {
    const error = new KernelAlreadyBootedError()

    expect(error.name).toBe('KernelAlreadyBootedError')
    expect(error.message).toContain('booted')
  })
})

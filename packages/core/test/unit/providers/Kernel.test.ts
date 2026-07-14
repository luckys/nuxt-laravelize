import { describe, expect, it } from 'vitest'

import { createContainer, type Container } from '../../../src/core/container/Container'
import {
  KernelAlreadyBootedError,
  ProviderBootError,
} from '../../../src/core/container/ContainerErrors'
import { createToken } from '../../../src/core/container/Token'
import { Kernel } from '../../../src/core/providers/Kernel'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

describe('Kernel', () => {
  it('runs register on every provider before booting any of them', async () => {
    const events: string[] = []

    class FirstProvider implements ServiceProvider {
      register(): void {
        events.push('register:first')
      }

      boot(): void {
        events.push('boot:first')
      }
    }

    class SecondProvider implements ServiceProvider {
      register(): void {
        events.push('register:second')
      }

      boot(): void {
        events.push('boot:second')
      }
    }

    const kernel = new Kernel(createContainer(), [FirstProvider, SecondProvider])
    await kernel.boot()

    expect(events).toEqual([
      'register:first',
      'register:second',
      'boot:first',
      'boot:second',
    ])
  })

  it('makes registered services resolvable after boot', async () => {
    const clockToken = createToken<string>('clock')

    class ClockProvider implements ServiceProvider {
      register(container: Container): void {
        container.singleton(clockToken, () => 'tick')
      }
    }

    const container = createContainer()
    const kernel = new Kernel(container, [ClockProvider])
    await kernel.boot()

    expect(container.make(clockToken)).toBe('tick')
  })

  it('awaits asynchronous boot methods', async () => {
    const events: string[] = []

    class AsyncProvider implements ServiceProvider {
      register(): void {}

      async boot(): Promise<void> {
        await Promise.resolve()
        events.push('booted')
      }
    }

    const kernel = new Kernel(createContainer(), [AsyncProvider])
    await kernel.boot()

    expect(events).toEqual(['booted'])
  })

  it('wraps a failing boot in ProviderBootError with the provider name', async () => {
    class BrokenProvider implements ServiceProvider {
      register(): void {}

      boot(): void {
        throw new Error('database offline')
      }
    }

    const kernel = new Kernel(createContainer(), [BrokenProvider])

    let caught: unknown
    try {
      await kernel.boot()
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ProviderBootError)
    expect((caught as ProviderBootError).message).toContain('BrokenProvider')
  })

  it('seals the container after boot so late registrations fail', async () => {
    const lateToken = createToken<string>('late')

    class EmptyProvider implements ServiceProvider {
      register(): void {}
    }

    const container = createContainer()
    const kernel = new Kernel(container, [EmptyProvider])
    await kernel.boot()

    expect(() => container.bind(lateToken, () => 'nope')).toThrow(KernelAlreadyBootedError)
  })
})

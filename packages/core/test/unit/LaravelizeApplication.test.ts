import { describe, expect, it, vi } from 'vitest'

import { LaravelizeApplication } from '../../src/core/LaravelizeApplication'
import type { Container } from '../../src/core/container/Container'
import type { ServiceProvider } from '../../src/core/providers/ServiceProvider'

describe('LaravelizeApplication', () => {
  it('boots once before creating scopes and disposes the root container', async () => {
    const scope = { dispose: vi.fn() } as unknown as Container
    const container = {
      createScope: vi.fn(() => scope),
      dispose: vi.fn().mockResolvedValue(undefined),
      seal: vi.fn(),
    } as unknown as Container
    const register = vi.fn()
    const boot = vi.fn()

    class Provider implements ServiceProvider {
      register = register
      boot = boot
    }

    const application = new LaravelizeApplication([Provider], container)

    await application.createScope()
    await application.createScope()
    await application.close()

    expect(register).toHaveBeenCalledOnce()
    expect(boot).toHaveBeenCalledOnce()
    expect(container.createScope).toHaveBeenCalledTimes(2)
    expect(container.dispose).toHaveBeenCalledOnce()
  })
})

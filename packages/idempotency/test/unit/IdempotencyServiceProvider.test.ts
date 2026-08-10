import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryIdempotencyStore } from '../../src/runtime/store'
import { idempotencyStoreToken } from '../../src/runtime/tokens'
import IdempotencyServiceProvider from '../../src/runtime/server/IdempotencyServiceProvider'

const state = vi.hoisted(() => ({ driver: 'none' as 'none' | 'memory' }))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ laravelizeIdempotency: { driver: state.driver } }),
}))

describe('IdempotencyServiceProvider', () => {
  beforeEach(() => {
    state.driver = 'none'
  })

  it('fails closed when volatile memory was not explicitly selected', () => {
    const container = createContainer()
    new IdempotencyServiceProvider().register(container)
    expect(() => container.make(idempotencyStoreToken)).toThrow()
  })

  it('registers memory only when explicitly configured', () => {
    state.driver = 'memory'
    const container = createContainer()
    new IdempotencyServiceProvider().register(container)
    expect(container.make(idempotencyStoreToken)).toBeInstanceOf(InMemoryIdempotencyStore)
    expect(container.make(idempotencyStoreToken)).toBe(container.make(idempotencyStoreToken))
  })

  it('preserves a custom durable store binding', () => {
    state.driver = 'memory'
    const container = createContainer()
    const custom = new InMemoryIdempotencyStore()
    container.instance(idempotencyStoreToken, custom)
    new IdempotencyServiceProvider().register(container)
    expect(container.make(idempotencyStoreToken)).toBe(custom)
  })
})

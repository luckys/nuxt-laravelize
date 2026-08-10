import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { describe, expect, it } from 'vitest'
import Provider from '../src/runtime/server/DeadLetterOperationsServiceProvider'
import { deadLetterAdapterRegistryToken, deadLetterManagerToken } from '../src/runtime/tokens'

describe('DeadLetterOperationsServiceProvider', () => {
  it('registers only singleton registry and manager services', () => {
    const container = createContainer()
    new Provider().register(container)
    expect(container.make(deadLetterAdapterRegistryToken)).toBe(container.make(deadLetterAdapterRegistryToken))
    expect(container.make(deadLetterManagerToken)).toBe(container.make(deadLetterManagerToken))
    expect(container.make(deadLetterAdapterRegistryToken).sources()).toEqual([])
  })
  it('preserves application registrations', () => {
    const container = createContainer()
    const registry = { sources: () => ['application'] }
    container.singleton(deadLetterAdapterRegistryToken, () => registry as never)
    new Provider().register(container)
    expect(container.make(deadLetterAdapterRegistryToken)).toBe(registry)
  })
})

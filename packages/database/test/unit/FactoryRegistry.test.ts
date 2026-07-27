import { describe, expect, it } from 'vitest'
import { DefaultFactoryRegistry, Factory, UnknownFactory } from '../../src/database/factories'

class ValueFactory extends Factory<{ value: number }> {
  protected definition() { return { value: 1 } }
}

describe('DefaultFactoryRegistry', () => {
  it('registers, lists, checks, and resolves fresh factory instances', () => {
    const registry = new DefaultFactoryRegistry()
    registry.register('value', () => new ValueFactory())

    expect(registry.list()).toEqual(['value'])
    expect(registry.has('value')).toBe(true)
    expect(registry.resolve('value')).not.toBe(registry.resolve('value'))
  })

  it('throws UnknownFactory for missing registrations', () => {
    expect(() => new DefaultFactoryRegistry().resolve('missing')).toThrow(UnknownFactory)
  })
})

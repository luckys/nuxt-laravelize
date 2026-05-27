import { describe, expect, it } from 'vitest'

import { Factory } from '../../src/database/factories/Factory'
import {
  DefaultFactoryRegistry,
  UnknownFactory,
} from '../../src/database/factories/FactoryRegistry'

interface InvoiceShape {
  id: string
  amount: number
  paid: boolean
}

class InvoiceFactory extends Factory<InvoiceShape> {
  protected definition(): InvoiceShape {
    return { id: this.faker.string.uuid(), amount: 100, paid: false }
  }
}

describe('Factory', () => {
  it('returns a single item when count is 1 (default)', () => {
    const item = new InvoiceFactory().make()
    expect(Array.isArray(item)).toBe(false)
    expect((item as InvoiceShape).amount).toBe(100)
  })

  it('returns an array when count > 1', () => {
    const items = new InvoiceFactory().count(3).make() as InvoiceShape[]
    expect(items).toHaveLength(3)
    expect(items.every((i) => i.amount === 100)).toBe(true)
  })

  it('applies state overrides via object', () => {
    const item = new InvoiceFactory().state({ paid: true }).make() as InvoiceShape
    expect(item.paid).toBe(true)
  })

  it('applies state overrides via function', () => {
    const item = new InvoiceFactory()
      .state((d) => ({ amount: d.amount * 2 }))
      .make() as InvoiceShape
    expect(item.amount).toBe(200)
  })

  it('chains multiple state() calls in order', () => {
    const item = new InvoiceFactory()
      .state({ amount: 50 })
      .state((d) => ({ amount: d.amount + 10 }))
      .make() as InvoiceShape
    expect(item.amount).toBe(60)
  })

  it('applies explicit overrides passed to make()', () => {
    const item = new InvoiceFactory().make({ amount: 1 }) as InvoiceShape
    expect(item.amount).toBe(1)
  })

  it('rejects non-positive counts', () => {
    expect(() => new InvoiceFactory().count(0)).toThrow()
    expect(() => new InvoiceFactory().count(-1)).toThrow()
  })

  it('create() persists each made item', async () => {
    const persisted: InvoiceShape[] = []
    await new InvoiceFactory().count(2).create(async (i) => { persisted.push(i) })
    expect(persisted).toHaveLength(2)
  })
})

describe('DefaultFactoryRegistry', () => {
  it('resolves and lists registered factories', () => {
    const reg = new DefaultFactoryRegistry()
    reg.register('invoice', () => new InvoiceFactory())
    expect(reg.list()).toEqual(['invoice'])
    expect(reg.resolve('invoice')).toBeInstanceOf(InvoiceFactory)
  })

  it('throws UnknownFactory when missing', () => {
    expect(() => new DefaultFactoryRegistry().resolve('absent')).toThrow(UnknownFactory)
  })
})

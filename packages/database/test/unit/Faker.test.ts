import { describe, expect, it } from 'vitest'
import { builtInFaker } from '../../src/database/factories'

describe('builtInFaker', () => {
  it('reproduces random and date values with a seed and fixed clock', () => {
    const options = { seed: 42, now: new Date('2025-01-15T12:00:00.000Z') }
    const first = builtInFaker(options)
    const second = builtInFaker(options)

    const firstValues = [first.string.uuid(), first.date.past(), first.date.recent()]
    expect(firstValues).toEqual([second.string.uuid(), second.date.past(), second.date.recent()])
    expect(firstValues).toEqual([
      '41936071-dfd7-7d91-8fee-8284fd2d7008',
      new Date('2024-03-18T12:00:00.000Z'),
      new Date('2025-01-14T15:42:43.305Z'),
    ])
  })

  it('retains the numeric seed overload', () => {
    expect(builtInFaker(7).string.sample()).toBe(builtInFaker(7).string.sample())
  })

  it('supports a clock function', () => {
    const faker = builtInFaker({ seed: 1, now: () => 1_700_000_000_000 })
    expect(faker.date.recent().getTime()).toBeLessThanOrEqual(1_700_000_000_000)
  })

  it('rejects invalid seeds, clocks, lengths, and number ranges', () => {
    expect(() => builtInFaker({ seed: -1 })).toThrow('seed must be an integer between')
    expect(() => builtInFaker({ seed: Number.NaN })).toThrow('seed must be an integer between')
    expect(() => builtInFaker({ now: new Date('invalid') })).toThrow('now must be a valid time')
    expect(() => builtInFaker({ now: Number.MAX_VALUE })).toThrow('now must be a valid time')
    expect(() => builtInFaker({ now: () => Number.POSITIVE_INFINITY }).date.past()).toThrow('now must be a valid time')

    const faker = builtInFaker(1)
    expect(() => faker.string.sample(-1)).toThrow('length must be a non-negative integer')
    expect(() => faker.number.int({ min: 2, max: 1 })).toThrow('min must be less than or equal to max')
    expect(() => faker.number.int({ min: 0.5 })).toThrow('integer range bounds must be safe integers')
    expect(() => faker.number.int({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }))
      .toThrow('integer range span must be a safe integer')
    expect(() => faker.number.float({ min: Number.NaN })).toThrow('number range bounds must be finite')
    expect(() => faker.number.float({ min: -Number.MAX_VALUE, max: Number.MAX_VALUE }))
      .toThrow('number range span must be finite')
  })
})

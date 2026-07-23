import { describe, expect, it } from 'vitest'
import { CacheCorruptionError, JsonCacheSerializer } from '../../src/JsonCacheSerializer'

describe('JsonCacheSerializer', () => {
  const serializer = new JsonCacheSerializer()

  it('round trips every supported JSON-safe value with a version marker', () => {
    const value = { nil: null, yes: true, count: 1.25, text: 'ok', list: [false, 2] }
    expect(serializer.decode(serializer.encode(value))).toEqual(value)
    expect(serializer.encode(12)).toBe('LZC1:N:12')
  })

  it.each([
    undefined,
    { nested: undefined },
    Number.NaN,
    1n,
    Symbol('x'),
    () => undefined,
    new Date(),
  ])('rejects unsupported value %#', (value) => {
    expect(() => serializer.encode(value as never)).toThrow()
  })

  it('rejects cycles, reserved keys, malformed data and wrong version markers', () => {
    const cycle: unknown[] = []
    cycle.push(cycle)
    expect(() => serializer.encode(cycle as never)).toThrow('cycles')
    expect(() => serializer.encode(JSON.parse('{"constructor":true}'))).toThrow('reserved')
    expect(() => serializer.decode('LZC1:J:{bad')).toThrow(CacheCorruptionError)
    expect(() => serializer.decode('LZC2:J:null')).toThrow(CacheCorruptionError)
    expect(() => serializer.decode('LZC1:N:"1"')).toThrow(CacheCorruptionError)
  })
})

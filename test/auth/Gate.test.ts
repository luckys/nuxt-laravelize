import { describe, expect, it } from 'vitest'

import { GateRuleNotDefinedError } from '../../src/auth/GateRuleNotDefinedError'
import { InMemoryGate } from '../../src/auth/Gate'

describe('InMemoryGate', () => {
  it('invokes a registered sync callback and returns its boolean result', async () => {
    const gate = new InMemoryGate()
    gate.define('always', () => true)

    expect(await gate.allows('always')).toBe(true)
  })

  it('invokes a registered async callback and resolves to its boolean result', async () => {
    const gate = new InMemoryGate()
    gate.define('async-allow', async () => true)

    expect(await gate.allows('async-allow')).toBe(true)
  })

  it('passes positional args to the callback in the order they were given', async () => {
    const received: unknown[] = []
    const gate = new InMemoryGate()
    gate.define('inspect', (...args) => {
      received.push(...args)
      return true
    })

    await gate.allows('inspect', { id: 1 }, 'role', 42)

    expect(received).toEqual([{ id: 1 }, 'role', 42])
  })

  it('returns false from allows when the callback returns false', async () => {
    const gate = new InMemoryGate()
    gate.define('always-deny', () => false)

    expect(await gate.allows('always-deny')).toBe(false)
  })

  it('denies is the negation of allows', async () => {
    const gate = new InMemoryGate()
    gate.define('allow', () => true)
    gate.define('deny', () => false)

    expect(await gate.denies('allow')).toBe(false)
    expect(await gate.denies('deny')).toBe(true)
  })

  it('throws GateRuleNotDefinedError when allows is called with an unknown rule', async () => {
    const gate = new InMemoryGate()

    await expect(gate.allows('missing')).rejects.toBeInstanceOf(GateRuleNotDefinedError)
    await expect(gate.allows('missing')).rejects.toThrow('Gate rule "missing" is not defined.')
  })

  it('overwrites a previously defined rule (last wins)', async () => {
    const gate = new InMemoryGate()
    gate.define('rule', () => true)
    gate.define('rule', () => false)

    expect(await gate.allows('rule')).toBe(false)
  })
})

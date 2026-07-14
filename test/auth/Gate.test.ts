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

  it('any short-circuits after the first allowed rule', async () => {
    const calls: string[] = []
    const gate = new InMemoryGate()
    gate.define('first', () => {
      calls.push('first')
      return false
    })
    gate.define('second', () => {
      calls.push('second')
      return true
    })
    gate.define('third', () => {
      calls.push('third')
      return true
    })

    expect(await gate.any(['first', 'second', 'third'])).toBe(true)
    expect(calls).toEqual(['first', 'second'])
  })

  it('none short-circuits after the first allowed rule', async () => {
    const calls: string[] = []
    const gate = new InMemoryGate()
    gate.define('first', () => {
      calls.push('first')
      return false
    })
    gate.define('second', () => {
      calls.push('second')
      return true
    })
    gate.define('third', () => {
      calls.push('third')
      return false
    })

    expect(await gate.none(['first', 'second', 'third'])).toBe(false)
    expect(calls).toEqual(['first', 'second'])
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

describe('InMemoryGate — authorize()', () => {
  it('resolves when the rule allows', async () => {
    const gate = new InMemoryGate()
    gate.define('update', () => true)

    await expect(gate.authorize('update')).resolves.toBeUndefined()
  })

  it('throws a 403 error when the rule denies', async () => {
    const gate = new InMemoryGate()
    gate.define('delete', () => false)

    await expect(gate.authorize('delete')).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  })

  it('throws GateRuleNotDefinedError for an unknown rule (delegates to allows)', async () => {
    const gate = new InMemoryGate()

    await expect(gate.authorize('unknown')).rejects.toBeInstanceOf(GateRuleNotDefinedError)
  })
})

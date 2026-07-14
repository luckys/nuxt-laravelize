import { describe, expect, it } from 'vitest'

import { createToken } from '../../../src/core/container/Token'

describe('createToken', () => {
  it('creates a token carrying the given key', () => {
    const token = createToken<string>('database.url')

    expect(token.key).toBe('database.url')
  })

  it('creates tokens with independent keys', () => {
    const first = createToken<number>('first')
    const second = createToken<number>('second')

    expect(first.key).not.toBe(second.key)
  })
})

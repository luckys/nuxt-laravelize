import { describe, expect, it } from 'vitest'

import { Pbkdf2Hasher } from '../../src/runtime/Pbkdf2Hasher'

describe('Pbkdf2Hasher', () => {
  it('creates salted hashes and verifies matching values', async () => {
    const hasher = new Pbkdf2Hasher(10_000)
    const first = await hasher.make('correct horse battery staple')
    const second = await hasher.make('correct horse battery staple')

    expect(first).not.toBe(second)
    await expect(hasher.check('correct horse battery staple', first)).resolves.toBe(true)
    await expect(hasher.check('wrong', first)).resolves.toBe(false)
  })

  it('detects hashes that need rehashing', async () => {
    const oldHasher = new Pbkdf2Hasher(10_000)
    const currentHasher = new Pbkdf2Hasher(20_000)
    const hash = await oldHasher.make('password')

    expect(oldHasher.needsRehash(hash)).toBe(false)
    expect(currentHasher.needsRehash(hash)).toBe(true)
    await expect(currentHasher.check('password', hash)).resolves.toBe(true)
  })

  it('rejects malformed, non-canonical and excessive-cost hashes before verification', async () => {
    const hasher = new Pbkdf2Hasher(10_000)
    await expect(hasher.check('password', 'invalid')).resolves.toBe(false)
    await expect(hasher.check('password', '$laravelize$pbkdf2-sha256$010000$AAAA$AAAA')).resolves.toBe(false)
    await expect(hasher.check('password', '$laravelize$pbkdf2-sha256$10000001$AAAA$AAAA')).resolves.toBe(false)
    expect(hasher.needsRehash('invalid')).toBe(true)
  })

  it('validates configured cost and password byte length', async () => {
    expect(() => new Pbkdf2Hasher(1)).toThrow('iterations')
    const hasher = new Pbkdf2Hasher(10_000)
    await expect(hasher.make('a'.repeat(1_048_577))).rejects.toThrow('maximum supported')
  })
})

import { describe, expect, it } from 'vitest'

import { AesGcmEncrypter } from '../../src/runtime/AesGcmEncrypter'
import { DecryptionError, InvalidEncryptionKeyError } from '../../src/runtime/Encrypter'
import { generateEncryptionKey } from '../../src/runtime/base64'

describe('AesGcmEncrypter', () => {
  it('encrypts strings and bytes with unique authenticated payloads', async () => {
    const encrypter = new AesGcmEncrypter(generateEncryptionKey())
    const first = await encrypter.encryptString('secret')
    const second = await encrypter.encryptString('secret')

    expect(first).not.toBe(second)
    await expect(encrypter.decryptString(first)).resolves.toBe('secret')
    const bytes = new Uint8Array([0, 1, 255])
    await expect(encrypter.decryptBytes(await encrypter.encryptBytes(bytes))).resolves.toEqual(bytes)
  })

  it('authenticates the payload and its purpose', async () => {
    const encrypter = new AesGcmEncrypter(generateEncryptionKey())
    const payload = await encrypter.encryptString('secret', { purpose: 'password-reset' })
    const tampered = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`

    await expect(encrypter.decryptString(payload, { purpose: 'session' })).rejects.toBeInstanceOf(DecryptionError)
    await expect(encrypter.decryptString(tampered, { purpose: 'password-reset' })).rejects.toBeInstanceOf(DecryptionError)
  })

  it('decrypts previous keys but encrypts only with the primary key', async () => {
    const previousKey = generateEncryptionKey()
    const primaryKey = generateEncryptionKey()
    const old = new AesGcmEncrypter(previousKey)
    const rotated = new AesGcmEncrypter(primaryKey, [previousKey])
    const current = new AesGcmEncrypter(primaryKey)

    await expect(rotated.decryptString(await old.encryptString('old'))).resolves.toBe('old')
    await expect(current.decryptString(await rotated.encryptString('new'))).resolves.toBe('new')
  })

  it('rejects malformed payloads and invalid keys without leaking details', async () => {
    expect(() => new AesGcmEncrypter('weak')).toThrow(InvalidEncryptionKeyError)
    const encrypter = new AesGcmEncrypter(generateEncryptionKey())
    await expect(encrypter.decryptString('invalid')).rejects.toBeInstanceOf(DecryptionError)
    await expect(encrypter.decryptString('v2.AAAA.AAAA')).rejects.toBeInstanceOf(DecryptionError)
  })
})

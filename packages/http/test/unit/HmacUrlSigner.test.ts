import { describe, expect, it } from 'vitest'

import { HmacUrlSigner, MissingUrlSigningKeyError } from '../../src/signed-urls/HmacUrlSigner'

const signer = new HmacUrlSigner('test-signing-key-with-at-least-32-bytes')

describe('HmacUrlSigner', () => {
  it('signs and validates an absolute URL', async () => {
    const signed = await signer.sign('https://example.com/invitations/1?role=admin')

    expect(signed).toContain('signature=')
    await expect(signer.hasValidSignature(signed)).resolves.toBe(true)
  })

  it('rejects path, query and host tampering', async () => {
    const signed = await signer.sign('https://example.com/downloads/1?disposition=inline')

    await expect(signer.hasValidSignature(signed.replace('/1', '/2'))).resolves.toBe(false)
    await expect(signer.hasValidSignature(signed.replace('inline', 'attachment'))).resolves.toBe(false)
    await expect(signer.hasValidSignature(signed.replace('example.com', 'attacker.example'))).resolves.toBe(false)
  })

  it('accepts reordered query parameters because canonicalization is stable', async () => {
    const signed = new URL(await signer.sign('https://example.com/search?b=2&a=1'))
    const reordered = new URL(signed.origin + signed.pathname)
    reordered.searchParams.set('signature', signed.searchParams.get('signature')!)
    reordered.searchParams.set('a', '1')
    reordered.searchParams.set('b', '2')

    await expect(signer.hasValidSignature(reordered)).resolves.toBe(true)
  })

  it('invalidates a temporary URL at its expiration boundary', async () => {
    const now = Date.UTC(2026, 0, 1)
    const expiresAt = now + 60_000
    const signed = await signer.sign('https://example.com/verify/1', { expiresAt })

    await expect(signer.hasValidSignature(signed, { now: expiresAt - 1_000 })).resolves.toBe(true)
    await expect(signer.hasValidSignature(signed, { now: expiresAt })).resolves.toBe(false)
  })

  it('supports relative signatures that ignore the origin', async () => {
    const signed = await signer.sign('/unsubscribe/1?list=news', { absolute: false })
    const firstOrigin = `https://first.example${signed}`
    const secondOrigin = `https://second.example${signed}`

    await expect(signer.hasValidSignature(firstOrigin, { absolute: false })).resolves.toBe(true)
    await expect(signer.hasValidSignature(secondOrigin, { absolute: false })).resolves.toBe(true)
    await expect(signer.hasValidSignature(firstOrigin)).resolves.toBe(false)
  })

  it('requires explicit relative mode for relative input', async () => {
    await expect(signer.sign('/verify/1')).rejects.toThrow('Absolute URL signing requires an absolute URL')
  })

  it('rejects an ambiguous reserved expiration parameter', async () => {
    await expect(signer.sign('https://example.com/download?expires=policy-name'))
      .rejects.toThrow('The "expires" query parameter is reserved')
  })

  it('rejects missing, malformed and invalid signatures', async () => {
    await expect(signer.hasValidSignature('https://example.com/verify/1')).resolves.toBe(false)
    await expect(signer.hasValidSignature('https://example.com/verify/1?signature=invalid')).resolves.toBe(false)

    const signed = await signer.sign('https://example.com/verify/1')
    await expect(new HmacUrlSigner('another-signing-key-with-32-bytes').hasValidSignature(signed)).resolves.toBe(false)
  })

  it('requires at least 32 bytes of private key material', () => {
    expect(() => new HmacUrlSigner('')).toThrow(MissingUrlSigningKeyError)
    expect(() => new HmacUrlSigner('short-key')).toThrow(MissingUrlSigningKeyError)
  })

  it('can require temporary signatures', async () => {
    const permanent = await signer.sign('https://example.com/verify/1')
    const temporary = await signer.sign('https://example.com/verify/1', { expiresAt: Date.now() + 60_000 })

    await expect(signer.hasValidSignature(permanent, { requireExpiration: true })).resolves.toBe(false)
    await expect(signer.hasValidSignature(temporary, { requireExpiration: true })).resolves.toBe(true)
  })

  it('can bind a signature to an HTTP method', async () => {
    const signed = await signer.sign('https://example.com/verify/1', { method: 'POST' })

    await expect(signer.hasValidSignature(signed, { method: 'POST' })).resolves.toBe(true)
    await expect(signer.hasValidSignature(signed, { method: 'GET' })).resolves.toBe(false)
  })
})

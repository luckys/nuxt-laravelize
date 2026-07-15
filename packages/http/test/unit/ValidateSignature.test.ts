import { createEvent, type H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { ValidateSignature } from '../../src/signed-urls/ValidateSignature'
import type { UrlSigner } from '../../src/signed-urls/UrlSigner'

function eventFor(url: string): H3Event {
  return createEvent(
    { url, headers: { host: 'example.com' }, socket: {} } as never,
    {} as never,
  )
}

describe('ValidateSignature', () => {
  it('continues when the request has a valid signature', async () => {
    const signer = { hasValidSignature: vi.fn().mockResolvedValue(true) } as unknown as UrlSigner
    const next = vi.fn().mockResolvedValue({ ok: true })

    await expect(new ValidateSignature(signer).handle(eventFor('/verify?signature=valid'), next))
      .resolves.toEqual({ ok: true })
    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects an invalid signature before the controller runs', async () => {
    const signer = { hasValidSignature: vi.fn().mockResolvedValue(false) } as unknown as UrlSigner
    const next = vi.fn()

    await expect(new ValidateSignature(signer).handle(eventFor('/verify'), next))
      .rejects.toMatchObject({ statusCode: 403, statusMessage: 'Invalid Signature' })
    expect(next).not.toHaveBeenCalled()
  })

  it('passes relative validation mode to the signer', async () => {
    const hasValidSignature = vi.fn().mockResolvedValue(true)
    const signer = { hasValidSignature } as unknown as UrlSigner

    await new ValidateSignature(signer, { absolute: false }).handle(eventFor('/verify'), async () => undefined)

    expect(hasValidSignature).toHaveBeenCalledWith(expect.any(URL), {
      absolute: false,
      method: undefined,
      requireExpiration: undefined,
    })
  })

  it('uses a canonical origin and can require method-bound temporary signatures', async () => {
    const hasValidSignature = vi.fn().mockResolvedValue(true)
    const signer = { hasValidSignature } as unknown as UrlSigner

    await new ValidateSignature(signer, {
      bindMethod: true,
      origin: 'https://app.example.com',
      requireExpiration: true,
    }).handle(eventFor('/verify?signature=value'), async () => undefined)

    expect(hasValidSignature).toHaveBeenCalledWith(
      new URL('https://app.example.com/verify?signature=value'),
      { absolute: undefined, method: 'GET', requireExpiration: true },
    )
  })
})

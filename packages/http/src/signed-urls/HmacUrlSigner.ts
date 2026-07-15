import type { SignatureValidationOptions, SignedUrlOptions, UrlSigner } from './UrlSigner'

const RELATIVE_BASE = 'http://nuxt-laravelize.local'
const SIGNATURE_PARAMETER = 'signature'
const EXPIRATION_PARAMETER = 'expires'

export class MissingUrlSigningKeyError extends Error {
  constructor() {
    super('URL signing requires at least 32 bytes of private key material.')
    this.name = 'MissingUrlSigningKeyError'
  }
}

export class HmacUrlSigner implements UrlSigner {
  readonly #key: Promise<CryptoKey>

  constructor(secret: string) {
    const keyMaterial = new TextEncoder().encode(secret)
    if (keyMaterial.byteLength < 32) throw new MissingUrlSigningKeyError()
    this.#key = crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }

  async sign(input: string | URL, options: SignedUrlOptions = {}): Promise<string> {
    const absolute = options.absolute ?? true
    const { url, relative } = parseUrl(input)
    if (absolute && relative) {
      throw new Error('Absolute URL signing requires an absolute URL. Pass { absolute: false } to sign a relative URL.')
    }

    url.searchParams.delete(SIGNATURE_PARAMETER)
    if (options.expiresAt === undefined && url.searchParams.has(EXPIRATION_PARAMETER)) {
      throw new Error('The "expires" query parameter is reserved. Pass expiresAt to create a temporary signed URL.')
    }
    url.searchParams.delete(EXPIRATION_PARAMETER)
    if (options.expiresAt !== undefined) {
      url.searchParams.set(EXPIRATION_PARAMETER, String(toUnixSeconds(options.expiresAt)))
    }

    const signature = await this.#signature(canonicalize(url, absolute, options.method))
    url.searchParams.set(SIGNATURE_PARAMETER, signature)
    return formatUrl(url, relative)
  }

  async hasValidSignature(input: string | URL, options: SignatureValidationOptions = {}): Promise<boolean> {
    const absolute = options.absolute ?? true
    const { url, relative } = parseUrl(input)
    if (absolute && relative) return false

    const signature = url.searchParams.get(SIGNATURE_PARAMETER)
    if (signature === null || !/^[a-f\d]{64}$/i.test(signature)) return false

    const expires = url.searchParams.get(EXPIRATION_PARAMETER)
    if (expires === null && options.requireExpiration === true) return false
    if (expires !== null) {
      const expiration = Number(expires)
      if (!Number.isSafeInteger(expiration) || expiration < 0) return false
      if (toUnixSeconds(options.now ?? Date.now()) >= expiration) return false
    }

    url.searchParams.delete(SIGNATURE_PARAMETER)
    const data = new TextEncoder().encode(canonicalize(url, absolute, options.method))
    return crypto.subtle.verify('HMAC', await this.#key, fromHex(signature), data)
  }

  async #signature(value: string): Promise<string> {
    const signature = await crypto.subtle.sign(
      'HMAC',
      await this.#key,
      new TextEncoder().encode(value),
    )
    return toHex(signature)
  }
}

function parseUrl(input: string | URL): { url: URL, relative: boolean } {
  if (input instanceof URL) return { url: new URL(input), relative: false }
  const relative = !/^[a-z][a-z\d+.-]*:\/\//i.test(input)
  return { url: new URL(input, RELATIVE_BASE), relative }
}

function canonicalize(url: URL, absolute: boolean, method?: string): string {
  const canonical = new URL(url)
  canonical.hash = ''
  canonical.searchParams.sort()
  const path = `${canonical.pathname}${canonical.search}`
  const value = absolute ? `${canonical.origin}${path}` : path
  return method === undefined ? value : `${method.toUpperCase()}\n${value}`
}

function formatUrl(url: URL, relative: boolean): string {
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString()
}

function toUnixSeconds(value: Date | number): number {
  const milliseconds = value instanceof Date ? value.getTime() : value
  if (!Number.isFinite(milliseconds)) throw new Error('URL signature time must be a finite Date or Unix timestamp in milliseconds.')
  return Math.floor(milliseconds / 1000)
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes.buffer as ArrayBuffer
}

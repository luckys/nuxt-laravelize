import type { Encrypter, EncryptionOptions } from './Encrypter'
import { DecryptionError } from './Encrypter'
import { decodeBase64Url, decodeEncryptionKey, encodeBase64Url } from './base64'

const VERSION = 'v1'
const IV_BYTES = 12
const MINIMUM_CIPHERTEXT_BYTES = 16

export class AesGcmEncrypter implements Encrypter {
  readonly #keys: Promise<CryptoKey>[]

  constructor(primaryKey: string, previousKeys: readonly string[] = []) {
    this.#keys = [primaryKey, ...previousKeys].map(key => crypto.subtle.importKey(
      'raw',
      toArrayBuffer(decodeEncryptionKey(key)),
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    ))
  }

  encryptString(value: string, options?: EncryptionOptions): Promise<string> {
    return this.encryptBytes(new TextEncoder().encode(value), options)
  }

  async decryptString(payload: string, options?: EncryptionOptions): Promise<string> {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(await this.decryptBytes(payload, options))
    }
    catch (error) {
      if (error instanceof DecryptionError) throw error
      throw new DecryptionError()
    }
  }

  async encryptBytes(value: Uint8Array, options: EncryptionOptions = {}): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(additionalData(options.purpose)),
    }, await this.#keys[0]!, toArrayBuffer(value))
    return `${VERSION}.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(ciphertext))}`
  }

  async decryptBytes(payload: string, options: EncryptionOptions = {}): Promise<Uint8Array> {
    const parsed = parsePayload(payload)
    for (const key of this.#keys) {
      try {
        return new Uint8Array(await crypto.subtle.decrypt({
          name: 'AES-GCM',
          iv: toArrayBuffer(parsed.iv),
          additionalData: toArrayBuffer(additionalData(options.purpose)),
        }, await key, toArrayBuffer(parsed.ciphertext)))
      }
      catch {
        continue
      }
    }
    throw new DecryptionError()
  }
}

function parsePayload(payload: string): { iv: Uint8Array, ciphertext: Uint8Array } {
  try {
    const [version, encodedIv, encodedCiphertext, extra] = payload.split('.')
    if (version !== VERSION || !encodedIv || !encodedCiphertext || extra !== undefined) throw new DecryptionError()
    const iv = decodeBase64Url(encodedIv)
    const ciphertext = decodeBase64Url(encodedCiphertext)
    if (iv.byteLength !== IV_BYTES || ciphertext.byteLength < MINIMUM_CIPHERTEXT_BYTES) throw new DecryptionError()
    return { iv, ciphertext }
  }
  catch (error) {
    if (error instanceof DecryptionError) throw error
    throw new DecryptionError()
  }
}

function additionalData(purpose = ''): Uint8Array {
  return new TextEncoder().encode(`nuxt-laravelize:encryption:${VERSION}\0${purpose}`)
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer
}

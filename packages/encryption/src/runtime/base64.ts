import { InvalidEncryptionKeyError } from './Encrypter'

export function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error('Invalid base64url value.')
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
  const decoded = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (encodeBase64Url(decoded) !== value) throw new Error('Invalid base64url value.')
  return decoded
}

export function decodeEncryptionKey(value: string): Uint8Array<ArrayBuffer> {
  try {
    const decoded = decodeBase64Url(value)
    if (decoded.byteLength !== 32) throw new InvalidEncryptionKeyError()
    return decoded
  }
  catch (error) {
    if (error instanceof InvalidEncryptionKeyError) throw error
    throw new InvalidEncryptionKeyError()
  }
}

export function generateEncryptionKey(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

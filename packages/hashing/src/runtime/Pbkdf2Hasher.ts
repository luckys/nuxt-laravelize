import type { Hasher } from './Hasher'

const PREFIX = 'laravelize'
const ALGORITHM = 'pbkdf2-sha256'
const SALT_BYTES = 16
const HASH_BYTES = 32
const MINIMUM_ITERATIONS = 10_000
const MAXIMUM_ITERATIONS = 10_000_000
const MAXIMUM_PASSWORD_BYTES = 1_048_576
const COMPARISON_MESSAGE = new TextEncoder().encode('nuxt-laravelize:hash-comparison:v1')

interface ParsedHash {
  iterations: number
  salt: Uint8Array<ArrayBuffer>
  hash: Uint8Array<ArrayBuffer>
}

export class Pbkdf2Hasher implements Hasher {
  constructor(readonly iterations = 600_000) {
    if (!Number.isSafeInteger(iterations) || iterations < MINIMUM_ITERATIONS || iterations > MAXIMUM_ITERATIONS) {
      throw new Error(`PBKDF2 iterations must be an integer between ${MINIMUM_ITERATIONS} and ${MAXIMUM_ITERATIONS}.`)
    }
  }

  async make(value: string): Promise<string> {
    const password = encodePassword(value)
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
    const hash = await derive(password, salt, this.iterations)
    return `$${PREFIX}$${ALGORITHM}$${this.iterations}$${encodeBase64Url(salt)}$${encodeBase64Url(hash)}`
  }

  async check(value: string, encodedHash: string): Promise<boolean> {
    const parsed = parseHash(encodedHash)
    if (parsed === undefined) return false
    const actual = await derive(encodePassword(value), parsed.salt, parsed.iterations)
    return await secureEqual(parsed.hash, actual)
  }

  needsRehash(encodedHash: string): boolean {
    return parseHash(encodedHash)?.iterations !== this.iterations
  }
}

async function derive(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey('raw', toArrayBuffer(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: toArrayBuffer(salt),
    iterations,
  }, material, HASH_BYTES * 8)
  return new Uint8Array(bits)
}

async function secureEqual(expected: Uint8Array, actual: Uint8Array): Promise<boolean> {
  const algorithm = { name: 'HMAC', hash: 'SHA-256' }
  const actualKey = await crypto.subtle.importKey('raw', toArrayBuffer(actual), algorithm, false, ['sign'])
  const expectedKey = await crypto.subtle.importKey('raw', toArrayBuffer(expected), algorithm, false, ['verify'])
  const signature = await crypto.subtle.sign(algorithm, actualKey, toArrayBuffer(COMPARISON_MESSAGE))
  return await crypto.subtle.verify(algorithm, expectedKey, signature, toArrayBuffer(COMPARISON_MESSAGE))
}

function parseHash(value: string): ParsedHash | undefined {
  try {
    const [empty, prefix, algorithm, encodedIterations, encodedSalt, encodedHash, extra] = value.split('$')
    if (empty !== '' || prefix !== PREFIX || algorithm !== ALGORITHM || !encodedIterations || !encodedSalt || !encodedHash || extra !== undefined) return undefined
    if (!/^\d+$/.test(encodedIterations)) return undefined
    const iterations = Number(encodedIterations)
    if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > MAXIMUM_ITERATIONS) return undefined
    if (String(iterations) !== encodedIterations) return undefined
    const salt = decodeBase64Url(encodedSalt)
    const hash = decodeBase64Url(encodedHash)
    if (salt.byteLength !== SALT_BYTES || hash.byteLength !== HASH_BYTES) return undefined
    return { iterations, salt, hash }
  }
  catch {
    return undefined
  }
}

function encodePassword(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value)
  if (encoded.byteLength > MAXIMUM_PASSWORD_BYTES) throw new Error('Password exceeds the maximum supported byte length.')
  return encoded
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[\w-]+$/.test(value)) throw new Error('Invalid base64url value.')
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding)
  const decoded = Uint8Array.from(binary, character => character.charCodeAt(0))
  if (encodeBase64Url(decoded) !== value) throw new Error('Invalid base64url value.')
  return decoded
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer
}

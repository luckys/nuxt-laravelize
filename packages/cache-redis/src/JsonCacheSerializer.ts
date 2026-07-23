export type JsonCacheValue = null | boolean | number | string | JsonCacheValue[] | { [key: string]: JsonCacheValue }

export interface CacheSerializer {
  encode(value: JsonCacheValue): string
  decode(payload: string): JsonCacheValue
}

const NUMBER_PREFIX = 'LZC1:N:'
const JSON_PREFIX = 'LZC1:J:'
const MAX_PAYLOAD_BYTES = 1_048_576
const MAX_DEPTH = 64
const MAX_NODES = 10_000
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export class JsonCacheSerializer implements CacheSerializer {
  encode(value: JsonCacheValue): string {
    validate(value)
    const payload = typeof value === 'number' ? `${NUMBER_PREFIX}${JSON.stringify(value)}` : `${JSON_PREFIX}${JSON.stringify(value)}`
    if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) throw new Error('Cache payload exceeds the 1 MiB limit.')
    return payload
  }

  decode(payload: string): JsonCacheValue {
    if (Buffer.byteLength(payload) > MAX_PAYLOAD_BYTES) throw new CacheCorruptionError('Stored cache payload is too large.')
    const prefix = payload.slice(0, NUMBER_PREFIX.length)
    if (prefix !== NUMBER_PREFIX && prefix !== JSON_PREFIX) throw new CacheCorruptionError('Stored cache payload has an unsupported format.')
    try {
      const value: unknown = JSON.parse(payload.slice(NUMBER_PREFIX.length))
      validate(value)
      if ((prefix === NUMBER_PREFIX) !== (typeof value === 'number')) throw new Error('type marker mismatch')
      return value as JsonCacheValue
    }
    catch (error) {
      if (error instanceof CacheCorruptionError) throw error
      throw new CacheCorruptionError('Stored cache payload is malformed.')
    }
  }
}

export class CacheCorruptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CacheCorruptionError'
  }
}

function validate(root: unknown): asserts root is JsonCacheValue {
  let nodes = 0
  const ancestors = new Set<object>()
  const visit = (value: unknown, depth: number): void => {
    nodes += 1
    if (nodes > MAX_NODES || depth > MAX_DEPTH) throw new TypeError('Cache value exceeds serializer complexity limits.')
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Cache numbers must be finite.')
      return
    }
    if (typeof value !== 'object') throw new TypeError('Cache values must be JSON-safe and cannot contain undefined, bigint, symbols, or functions.')
    if (ancestors.has(value)) throw new TypeError('Cache values cannot contain cycles.')
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError('Cache values cannot contain class instances.')
    ancestors.add(value)
    if (Array.isArray(value)) for (const item of value) visit(item, depth + 1)
    else for (const [key, item] of Object.entries(value)) {
      if (RESERVED_KEYS.has(key)) throw new TypeError(`Cache object key "${key}" is reserved.`)
      visit(item, depth + 1)
    }
    ancestors.delete(value)
  }
  visit(root, 0)
}

export const defaultCacheSerializer = new JsonCacheSerializer()
export const numericPayloadPrefix = NUMBER_PREFIX

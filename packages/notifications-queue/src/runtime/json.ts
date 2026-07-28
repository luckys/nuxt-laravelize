import type { JsonValue } from '@nuxt-laravelize/reliability'

const encoder = new TextEncoder()
const LIMITS = { bytes: 262_144, depth: 32, nodes: 10_000, keys: 1_000, array: 10_000, string: 65_536 } as const

export function assertJson(value: unknown): asserts value is JsonValue {
  const stack: Array<{ value?: unknown, depth: number, exit?: object }> = [{ value, depth: 0 }]
  const seen = new Set<object>()
  let bytes = 0
  let nodes = 0
  while (stack.length) {
    const current = stack.pop()!
    if (current.exit) {
      seen.delete(current.exit)
      continue
    }
    if (++nodes > LIMITS.nodes || current.depth > LIMITS.depth) throw new TypeError('Notification payload exceeds JSON structural limits')
    const value = current.value
    if (value === null || typeof value === 'boolean') continue
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Notification payload must be JSON-safe')
      continue
    }
    if (typeof value === 'string') {
      if (value.length > LIMITS.string) throw new TypeError('Notification payload JSON string is too large')
      bytes += encoder.encode(value).byteLength
      if (bytes > LIMITS.bytes) throw new TypeError('Notification payload JSON is too large')
      continue
    }
    if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('Notification payload must be JSON-safe')
    seen.add(value)
    stack.push({ depth: current.depth, exit: value })
    if (Array.isArray(value)) {
      if (value.length > LIMITS.array) throw new TypeError('Notification payload JSON array is too large')
      for (const child of value) stack.push({ value: child, depth: current.depth + 1 })
      continue
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Notification payload must be JSON-safe')
    const entries = Object.entries(value)
    if (entries.length > LIMITS.keys) throw new TypeError('Notification payload JSON object has too many keys')
    for (const [key, child] of entries) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new TypeError('Notification payload has a reserved JSON key')
      bytes += encoder.encode(key).byteLength
      stack.push({ value: child, depth: current.depth + 1 })
    }
    if (bytes > LIMITS.bytes) throw new TypeError('Notification payload JSON is too large')
  }
}

import type { WebhookNotificationEndpoint, WebhookNotificationJsonObject, WebhookNotificationRoute } from './contracts'

const SAFE = /^[A-Z0-9][\w.:-]{0,127}$/i
const encoder = new TextEncoder()
const LIMITS = { bytes: 65_536, depth: 16, nodes: 5_000, keys: 500, array: 5_000, string: 32_768 } as const

export function safeWebhookNotificationText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE.test(value)) throw new TypeError(`Invalid webhook notification ${field}`)
  return value
}

export function normalizeWebhookNotificationRoute(value: unknown): WebhookNotificationRoute {
  plainObject(value, 'Webhook notification route')
  if (Object.keys(value).some(key => key !== 'endpointId' && key !== 'tenantId')) throw new TypeError('Invalid webhook notification route key')
  const endpointId = safeWebhookNotificationText(value.endpointId, 'endpoint id')
  const tenantId = value.tenantId === undefined ? undefined : safeWebhookNotificationText(value.tenantId, 'tenant id')
  return Object.freeze({ endpointId, ...(tenantId ? { tenantId } : {}) })
}

export function normalizeWebhookNotificationEndpoint(value: unknown): WebhookNotificationEndpoint {
  plainObject(value, 'Webhook notification endpoint')
  if (Object.keys(value).some(key => !['endpointId', 'tenantId', 'url', 'secretId'].includes(key))) throw new TypeError('Invalid webhook notification endpoint key')
  const endpointId = safeWebhookNotificationText(value.endpointId, 'endpoint id')
  const tenantId = value.tenantId === undefined ? undefined : safeWebhookNotificationText(value.tenantId, 'tenant id')
  const secretId = safeWebhookNotificationText(value.secretId, 'secret id')
  if (typeof value.url !== 'string' || value.url.length > 2_048) throw new TypeError('Invalid webhook notification URL')
  let url: URL
  try {
    url = new URL(value.url)
  }
  catch { throw new TypeError('Invalid webhook notification URL') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443')) throw new TypeError('Webhook notification URL must use HTTPS without credentials, query, fragment, or a non-standard port')
  return Object.freeze({ endpointId, ...(tenantId ? { tenantId } : {}), url: url.toString(), secretId })
}

export function normalizeWebhookNotificationData(value: unknown): WebhookNotificationJsonObject {
  plainObject(value, 'Webhook notification data')
  assertJson(value)
  const normalized = structuredClone(value as WebhookNotificationJsonObject)
  assertEncodedSize(normalized)
  return Object.freeze(normalized)
}

export function assertWebhookNotificationBodySize(value: unknown): void {
  assertEncodedSize(value)
}

export function normalizeWebhookNotificationVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) throw new TypeError('Invalid webhook notification version')
  return value as number
}

export function canonicalWebhookNotificationTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32 || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('Invalid webhook notification occurredAt')
  return value
}

function plainObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${field} must be a plain object`)
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => !('value' in descriptor))) throw new TypeError(`${field} cannot contain accessors`)
}

function assertJson(value: unknown): void {
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
    if (++nodes > LIMITS.nodes || current.depth > LIMITS.depth) throw new TypeError('Webhook notification data exceeds JSON structural limits')
    const item = current.value
    if (item === null || typeof item === 'boolean') continue
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Webhook notification data must be JSON-safe')
      continue
    }
    if (typeof item === 'string') {
      if (item.length > LIMITS.string) throw new TypeError('Webhook notification JSON string is too large')
      bytes += encoder.encode(item).byteLength
      if (bytes > LIMITS.bytes) throw new TypeError('Webhook notification data is too large')
      continue
    }
    if (!item || typeof item !== 'object' || seen.has(item)) throw new TypeError('Webhook notification data must be JSON-safe')
    seen.add(item)
    stack.push({ depth: current.depth, exit: item })
    if (Array.isArray(item)) {
      if (item.length > LIMITS.array) throw new TypeError('Webhook notification JSON array is too large')
      const descriptors = Object.getOwnPropertyDescriptors(item)
      if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) throw new TypeError('Webhook notification JSON array cannot contain accessors')
      for (let index = 0; index < item.length; index++) {
        const descriptor = descriptors[index]
        if (!descriptor || !('value' in descriptor)) throw new TypeError('Webhook notification JSON arrays cannot be sparse')
        stack.push({ value: descriptor.value, depth: current.depth + 1 })
      }
      continue
    }
    plainObject(item, 'Webhook notification JSON object')
    const entries = Object.entries(item)
    if (entries.length > LIMITS.keys) throw new TypeError('Webhook notification JSON object has too many keys')
    for (const [key, child] of entries) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new TypeError('Webhook notification data has a reserved key')
      bytes += encoder.encode(key).byteLength
      stack.push({ value: child, depth: current.depth + 1 })
    }
    if (bytes > LIMITS.bytes) throw new TypeError('Webhook notification data is too large')
  }
}

function assertEncodedSize(value: unknown): void {
  if (encoder.encode(JSON.stringify(value)).byteLength > LIMITS.bytes) throw new TypeError('Webhook notification data is too large')
}

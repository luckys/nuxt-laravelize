import { assertJsonObject } from '@nuxt-laravelize/broadcasting/runtime'
import type { BroadcastNotificationJsonObject, BroadcastNotificationRecipient } from './contracts'

const SAFE = /^[A-Z0-9][\w.:-]{0,127}$/i

export function safeBroadcastNotificationText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE.test(value)) throw new TypeError(`Invalid broadcast notification ${field}`)
  return value
}

export function normalizeBroadcastNotificationRecipient(value: unknown): BroadcastNotificationRecipient {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Broadcast notification recipient must be a plain object')
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => key !== 'type' && key !== 'id' && key !== 'tenantId')) throw new TypeError('Invalid broadcast notification recipient key')
  const type = safeBroadcastNotificationText(input.type, 'recipient type')
  const id = safeBroadcastNotificationText(input.id, 'recipient id')
  const tenantId = input.tenantId === undefined ? undefined : safeBroadcastNotificationText(input.tenantId, 'tenant id')
  return Object.freeze({ type, id, ...(tenantId ? { tenantId } : {}) })
}

export function normalizeBroadcastNotificationData(value: unknown): BroadcastNotificationJsonObject {
  return Object.freeze(assertJsonObject(value))
}

export function normalizeBroadcastNotificationVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) throw new TypeError('Invalid broadcast notification version')
  return value as number
}

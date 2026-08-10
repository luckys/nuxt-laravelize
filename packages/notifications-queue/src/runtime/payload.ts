import type { JsonValue } from '@luckys_luis/nuxt-laravelize-reliability'
import { assertJson } from './json'
import { validateReference, validateType, validateVersion, type EncodedNotification, type RecipientReference } from './registries'

export interface QueuedNotificationPayload extends Record<string, unknown> {
  readonly version: 1
  readonly deliveryId: string
  readonly occurredAt: string
  readonly tenantId?: string
  readonly channel: string
  readonly notification: EncodedNotification
  readonly recipient: RecipientReference
}

const ID = /^[A-Z0-9][\w.:-]{0,127}$/i
const TENANT = /^[A-Z0-9][\w.-]{0,127}$/i
const CHANNEL = /^[A-Z0-9][\w.-]{0,63}$/i

export function validateQueuedNotificationPayload(value: unknown): QueuedNotificationPayload {
  try {
    plain(value, 'payload')
    const input = value as Record<string, unknown>
    exactKeys(input, ['version', 'deliveryId', 'occurredAt', 'tenantId', 'channel', 'notification', 'recipient'])
    if (input.version !== 1) throw new TypeError('version')
    const deliveryId = pattern(input.deliveryId, ID, 'delivery id')
    const occurredAt = isoDate(input.occurredAt)
    const tenantId = input.tenantId === undefined ? undefined : pattern(input.tenantId, TENANT, 'tenant')
    const channel = pattern(input.channel, CHANNEL, 'channel')
    plain(input.notification, 'notification')
    const notificationInput = input.notification as Record<string, unknown>
    exactKeys(notificationInput, ['type', 'version', 'payload'])
    const notification = { type: validateType(notificationInput.type, 'notification type'), version: validateVersion(notificationInput.version, 'notification version'), payload: notificationInput.payload as JsonValue }
    assertJson(notification.payload)
    plain(input.recipient, 'recipient')
    const recipientInput = input.recipient as Record<string, unknown>
    exactKeys(recipientInput, ['type', 'version', 'id'])
    const recipient = { type: validateType(recipientInput.type, 'recipient type'), version: validateVersion(recipientInput.version, 'recipient version'), id: validateReference(recipientInput.id) }
    return { version: 1, deliveryId, occurredAt, ...(tenantId ? { tenantId } : {}), channel, notification, recipient }
  }
  catch (error) {
    throw new TypeError('Invalid queued notification payload', { cause: error })
  }
}

function plain(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(field)
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError('unknown field')
}
function pattern(value: unknown, expression: RegExp, field: string): string {
  if (typeof value !== 'string' || !expression.test(value)) throw new TypeError(field)
  return value
}
function isoDate(value: unknown): string {
  if (typeof value !== 'string' || value.length > 32 || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError('occurredAt')
  return value
}

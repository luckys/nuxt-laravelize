import { PrivateChannel, type BroadcastingManager } from '@nuxt-laravelize/broadcasting/runtime'
import type { Notifiable, Notification, NotificationChannel, NotificationDeliveryContext } from '@nuxt-laravelize/notifications/runtime'
import type { BroadcastNotificationJsonObject, BroadcastNotificationRecipient } from './contracts'
import { normalizeBroadcastNotificationData, normalizeBroadcastNotificationRecipient, normalizeBroadcastNotificationVersion, safeBroadcastNotificationText } from './validation'

export const broadcastNotificationEvent = 'notification.created'

interface BroadcastableNotification extends Notification {
  broadcastType(): string
  broadcastVersion(): number
  toBroadcast(notifiable: Notifiable, context?: NotificationDeliveryContext): BroadcastNotificationJsonObject | Promise<BroadcastNotificationJsonObject>
}

export class InvalidBroadcastNotificationError extends TypeError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidBroadcastNotificationError'
  }
}

export class BroadcastNotificationChannel implements NotificationChannel {
  constructor(
    private readonly broadcasting: BroadcastingManager,
    private readonly currentTenant?: () => string | undefined,
    private readonly idFactory: () => string = () => crypto.randomUUID(),
    private readonly channelNameFactory: (recipient: BroadcastNotificationRecipient) => Promise<string> = broadcastNotificationChannelName,
  ) {}

  async send(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    context?.signal?.throwIfAborted()
    if (!isBroadcastableNotification(notification)) throw new InvalidBroadcastNotificationError('Broadcast notifications require broadcastType(), broadcastVersion(), and toBroadcast()')
    let recipient: BroadcastNotificationRecipient
    try {
      recipient = normalizeBroadcastNotificationRecipient(notifiable.routeNotificationFor('broadcast', notification))
    }
    catch (error) { throw new InvalidBroadcastNotificationError('Invalid broadcast notification recipient', { cause: error }) }
    const contextTenant = context?.tenantId
    const ambientTenant = this.currentTenant?.()
    if (contextTenant !== undefined) safeBroadcastNotificationText(contextTenant, 'tenant id')
    if (ambientTenant !== undefined) safeBroadcastNotificationText(ambientTenant, 'tenant id')
    if (contextTenant !== undefined && ambientTenant !== undefined && contextTenant !== ambientTenant) throw new InvalidBroadcastNotificationError('Broadcast notification execution tenant mismatch')
    const trustedTenant = contextTenant ?? ambientTenant
    if (recipient.tenantId !== undefined && trustedTenant === undefined) throw new InvalidBroadcastNotificationError('Broadcast notification tenant requires trusted execution context')
    if (trustedTenant !== undefined && recipient.tenantId !== undefined && trustedTenant !== recipient.tenantId) throw new InvalidBroadcastNotificationError('Broadcast notification tenant mismatch')
    recipient = { ...recipient, ...(trustedTenant ? { tenantId: trustedTenant } : {}) }
    const type = safeBroadcastNotificationText(notification.broadcastType(), 'type')
    const version = normalizeBroadcastNotificationVersion(notification.broadcastVersion())
    const data = normalizeBroadcastNotificationData(await notification.toBroadcast(notifiable, context))
    context?.signal?.throwIfAborted()
    const id = safeBroadcastNotificationText(context?.idempotencyKey ?? this.idFactory(), 'delivery id')
    const channel = new PrivateChannel(await this.channelNameFactory(recipient))
    context?.signal?.throwIfAborted()
    await this.broadcasting.broadcast({
      channels: [channel],
      event: broadcastNotificationEvent,
      payload: { id, type, version, data, ...(context?.locale ? { locale: context.locale } : {}) },
    })
  }
}

export async function broadcastNotificationChannelName(recipient: BroadcastNotificationRecipient): Promise<string> {
  const normalized = normalizeBroadcastNotificationRecipient(recipient)
  const value = JSON.stringify([normalized.tenantId ?? '', normalized.type, normalized.id])
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return `private-notifications.${[...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function isBroadcastableNotification(notification: Notification): notification is BroadcastableNotification {
  const candidate = notification as Partial<BroadcastableNotification>
  return typeof candidate.broadcastType === 'function' && typeof candidate.broadcastVersion === 'function' && typeof candidate.toBroadcast === 'function'
}

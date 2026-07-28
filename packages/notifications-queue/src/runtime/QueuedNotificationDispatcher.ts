import type { ExecutionContext } from '@nuxt-laravelize/execution-context/runtime'
import type { Notifiable, Notification } from '@nuxt-laravelize/notifications/runtime'
import type { JobHandle, Queue } from '@nuxt-laravelize/queue/runtime'
import type { QueuedNotificationOptions } from './contracts'
import { QueuedNotificationJob } from './QueuedNotificationJob'
import type { NotificationCodecRegistry, RecipientResolverRegistry } from './registries'

const ID = /^[A-Z0-9][\w.:-]{0,127}$/i

export class QueuedNotificationDispatcher {
  constructor(
    private readonly queue: Queue,
    private readonly codecs: NotificationCodecRegistry,
    private readonly recipients: RecipientResolverRegistry,
    private readonly currentContext?: () => ExecutionContext | undefined,
  ) {}

  async send(notifiable: Notifiable | readonly Notifiable[], notification: Notification, options: QueuedNotificationOptions = {}): Promise<readonly JobHandle[]> {
    if (options.dispatchId !== undefined && !ID.test(options.dispatchId)) throw new TypeError('Invalid notification dispatch id')
    const encoded = this.codecs.encode(notification)
    const context = this.currentContext?.()
    const tenantId = context?.snapshot().tenantId
    const values = Array.isArray(notifiable) ? notifiable : [notifiable]
    const jobs: JobHandle[] = []
    for (const recipient of values) {
      const reference = this.recipients.reference(recipient)
      const channels = [...new Set(notification.via(recipient))]
      for (const channel of channels) {
        const deliveryId = options.dispatchId ? await deterministicId(options.dispatchId, tenantId ?? '', reference.type, String(reference.version), reference.id, channel) : crypto.randomUUID()
        const job = new QueuedNotificationJob({ version: 1, deliveryId, occurredAt: new Date().toISOString(), ...(tenantId ? { tenantId } : {}), channel, notification: encoded, recipient: reference })
        jobs.push(await this.queue.push(job, { ...(options.dispatchId ? { id: deliveryId } : {}) }))
      }
    }
    return jobs
  }
}

async function deterministicId(...parts: string[]): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts))))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return `notify-${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

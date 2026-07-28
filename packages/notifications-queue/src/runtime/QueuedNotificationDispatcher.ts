import type { ExecutionContext } from '@nuxt-laravelize/execution-context/runtime'
import type { ChannelName, Notifiable, Notification, NotificationChannelDelays } from '@nuxt-laravelize/notifications/runtime'
import type { JobHandle, PushOptions, Queue } from '@nuxt-laravelize/queue/runtime'
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
    const pending: Array<{ job: QueuedNotificationJob, options: PushOptions }> = []
    for (const recipient of values) {
      const reference = this.recipients.reference(recipient)
      const channels = [...new Set(notification.via(recipient))]
      const delays = notification.withDelay ? notification.withDelay(recipient) : {}
      assertChannelDelays(delays, channels)
      for (const channel of channels) {
        const deliveryId = options.dispatchId ? await deterministicId(options.dispatchId, tenantId ?? '', reference.type, String(reference.version), reference.id, channel) : crypto.randomUUID()
        const job = new QueuedNotificationJob({ version: 1, deliveryId, occurredAt: new Date().toISOString(), ...(tenantId ? { tenantId } : {}), channel, notification: encoded, recipient: reference })
        const delay = delays[channel]
        pending.push({ job, options: { ...(options.dispatchId ? { id: deliveryId } : {}), ...(delay !== undefined ? { delay } : {}) } })
      }
    }
    const jobs: JobHandle[] = []
    for (const entry of pending) jobs.push(await this.queue.push(entry.job, entry.options))
    return jobs
  }
}

function assertChannelDelays(delays: NotificationChannelDelays, channels: readonly ChannelName[]): void {
  if (!delays || typeof delays !== 'object' || Array.isArray(delays)) throw new TypeError('Notification channel delays must be an object')
  for (const channel of channels) {
    const delay = delays[channel]
    if (delay !== undefined && (!Number.isSafeInteger(delay) || delay < 0 || delay > 86_400_000)) {
      throw new RangeError(`Notification delay for channel "${channel}" must be an integer between 0 and 86400000 milliseconds`)
    }
  }
}

async function deterministicId(...parts: string[]): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts))))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return `notify-${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`
}

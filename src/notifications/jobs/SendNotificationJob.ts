import { Job } from '../../queue/Job'

export interface SendNotificationPayload {
  readonly notifiableType: string
  readonly notifiableId: string | null
  readonly notificationName: string
  readonly args: readonly unknown[]
  readonly channels: readonly string[]
}

export interface SendNotificationDeps {
  resolveNotifiable(payload: SendNotificationPayload): Promise<unknown>
  resolveNotification(payload: SendNotificationPayload): Promise<unknown>
  dispatch(channel: string, notifiable: unknown, notification: unknown): Promise<void>
}

export class SendNotificationJob extends Job {
  static override readonly queue: string = 'notifications'

  constructor(private readonly payload: SendNotificationPayload) { super() }

  override async handle(deps?: SendNotificationDeps): Promise<void> {
    if (deps === undefined) return
    const notifiable = await deps.resolveNotifiable(this.payload)
    const notification = await deps.resolveNotification(this.payload)
    for (const channel of this.payload.channels) {
      await deps.dispatch(channel, notifiable, notification)
    }
  }

  override serialize(): { name: string, args: readonly unknown[] } {
    return { name: 'SendNotificationJob', args: [this.payload] }
  }
}

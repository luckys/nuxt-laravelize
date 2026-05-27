import { describe, expect, it } from 'vitest'

import { Mailable } from '../../src/mail/Mailable'
import type { Mailer } from '../../src/mail/Mailer'
import type { Logger } from '../../src/logging/Logger'
import { Notification } from '../../src/notifications/Notification'
import type { Notifiable, ChannelName } from '../../src/notifications/Notifiable'
import { LogChannel } from '../../src/notifications/channels/LogChannel'
import { MailChannel } from '../../src/notifications/channels/MailChannel'
import { QueueChannel } from '../../src/notifications/channels/QueueChannel'
import { SendNotificationJob } from '../../src/notifications/jobs/SendNotificationJob'
import {
  DefaultNotificationManager,
  UnknownNotificationChannel,
} from '../../src/notifications/NotificationManager'
import type { Queue, JobHandle, PushOptions } from '../../src/queue/Queue'
import type { Job } from '../../src/queue/Job'

class WelcomeMail extends Mailable {
  constructor(private readonly recipient: string) { super() }
  to() { return this.recipient }
  subject() { return 'Welcome' }
  render() { return '<p>hi</p>' }
}

class WelcomeNotification extends Notification {
  constructor(private readonly channels: readonly ChannelName[] = ['mail', 'log']) { super() }
  via() { return this.channels }
  override toMail(n: Notifiable) { return new WelcomeMail(n.routeNotificationFor('mail') ?? 'unknown') }
  override toLog(n: Notifiable) { return `Welcome user ${n.routeNotificationFor('log') ?? '?'}` }
  override toArray() { return { kind: 'welcome' } }
}

class User implements Notifiable {
  constructor(readonly id: string, readonly email: string) {}
  routeNotificationFor(channel: ChannelName): string | null {
    if (channel === 'mail') return this.email
    if (channel === 'log' || channel === 'queue') return this.id
    return null
  }
}

function fakeMailer(): { mailer: Mailer; sent: Mailable[] } {
  const sent: Mailable[] = []
  return { mailer: { send: async (m) => { sent.push(m) } }, sent }
}

function fakeLogger(): { logger: Logger; calls: Array<{ message: string; context: unknown }> } {
  const calls: Array<{ message: string; context: unknown }> = []
  return {
    logger: {
      debug: () => {},
      info: (m, c) => calls.push({ message: m, context: c }),
      warn: () => {},
      error: () => {},
      critical: () => {},
    },
    calls,
  }
}

function fakeQueue(): { queue: Queue; pushed: Array<{ job: Job; options: PushOptions | undefined }> } {
  const pushed: Array<{ job: Job; options: PushOptions | undefined }> = []
  return {
    queue: {
      push: async (job, options) => { pushed.push({ job, options }); return { id: 'fake', queue: 'notifications' } as JobHandle },
      later: async () => ({ id: 'fake', queue: 'notifications' } as JobHandle),
      size: async () => 0,
      clear: async () => {},
    },
    pushed,
  }
}

describe('MailChannel', () => {
  it('sends the mailable returned by toMail()', async () => {
    const { mailer, sent } = fakeMailer()
    const channel = new MailChannel(mailer)
    await channel.send(new User('u-1', 'ada@example.com'), new WelcomeNotification(['mail']))
    expect(sent).toHaveLength(1)
    expect(await sent[0]!.toMessage()).toMatchObject({ to: ['ada@example.com'], subject: 'Welcome' })
  })

  it('is a no-op when toMail is not defined', async () => {
    const { mailer, sent } = fakeMailer()
    class Silent extends Notification { via() { return ['mail' as const] } }
    await new MailChannel(mailer).send(new User('u', 'x'), new Silent())
    expect(sent).toHaveLength(0)
  })
})

describe('LogChannel', () => {
  it('logs notification name, message and payload', async () => {
    const { logger, calls } = fakeLogger()
    await new LogChannel(logger).send(new User('u-1', 'ada@example.com'), new WelcomeNotification(['log']))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.context).toMatchObject({
      channel: 'log',
      notification: 'WelcomeNotification',
      message: 'Welcome user u-1',
      payload: { kind: 'welcome' },
    })
  })
})

describe('QueueChannel', () => {
  it('enqueues a SendNotificationJob with the inline channels (without queue)', async () => {
    const { queue, pushed } = fakeQueue()
    await new QueueChannel(queue).send(new User('u-1', 'ada@example.com'), new WelcomeNotification(['mail', 'log', 'queue']))
    expect(pushed).toHaveLength(1)
    const job = pushed[0]!.job as SendNotificationJob
    expect(job).toBeInstanceOf(SendNotificationJob)
    expect(job.serialize().name).toBe('SendNotificationJob')
    const payload = job.serialize().args[0] as { channels: string[]; notificationName: string }
    expect(payload.channels).toEqual(['mail', 'log'])
    expect(payload.notificationName).toBe('WelcomeNotification')
  })
})

describe('DefaultNotificationManager', () => {
  it('dispatches a notification across every registered channel returned by via()', async () => {
    const { mailer, sent } = fakeMailer()
    const { logger, calls } = fakeLogger()
    const manager = new DefaultNotificationManager()
    manager.register('mail', new MailChannel(mailer))
    manager.register('log', new LogChannel(logger))
    await manager.send(new User('u-1', 'ada@example.com'), new WelcomeNotification(['mail', 'log']))
    expect(sent).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('throws UnknownNotificationChannel when no channel is registered', async () => {
    const manager = new DefaultNotificationManager()
    await expect(
      manager.send(new User('u', 'x'), new WelcomeNotification(['mail'])),
    ).rejects.toBeInstanceOf(UnknownNotificationChannel)
  })
})

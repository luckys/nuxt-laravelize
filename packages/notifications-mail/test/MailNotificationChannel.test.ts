import { describe, expect, it, vi } from 'vitest'
import { Notification, type NotificationDeliveryContext, type Notifiable } from '@nuxt-laravelize/notifications/runtime'
import { MailNotificationChannel, type MailNotificationContent } from '../src/runtime/index'

class WelcomeNotification extends Notification {
  constructor(private readonly content: MailNotificationContent) { super() }
  via(): readonly string[] { return ['mail'] }
  override toMail(): MailNotificationContent { return this.content }
}

const recipient = (route: unknown): Notifiable => ({ routeNotificationFor: vi.fn().mockReturnValue(route) })

describe('MailNotificationChannel', () => {
  it('routes exclusively from the notifiable, deduplicates addresses and propagates context', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const channel = new MailNotificationChannel({ send })
    const notifiable = recipient([' USER@example.com ', 'user@example.com', 'second@example.com'])
    const signal = new AbortController().signal
    const context: NotificationDeliveryContext = { locale: 'es', idempotencyKey: 'dispatch-1', signal }

    await channel.send(notifiable, new WelcomeNotification({ subject: 'Welcome', html: '<p>Hola</p>' }), context)

    const mailable = send.mock.calls[0]![0]
    await expect(mailable.toMessage()).resolves.toMatchObject({ to: ['USER@example.com', 'second@example.com'], subject: 'Welcome' })
    expect(send).toHaveBeenCalledWith(mailable, context)
    expect(notifiable.routeNotificationFor).toHaveBeenCalledWith('mail', expect.any(WelcomeNotification))
  })

  it.each([
    { route: '', content: { subject: 'ok', html: 'body' }, error: 'recipient' },
    { route: 'first@example.com, second@example.com', content: { subject: 'ok', html: 'body' }, error: 'recipient' },
    { route: 'victim@example.com\r\nBcc: attacker@example.com', content: { subject: 'ok', html: 'body' }, error: 'recipient' },
    { route: 'user@example.com', content: { subject: 'ok', html: 'body', from: 'first@example.com; second@example.com' }, error: 'from' },
    { route: 'user@example.com', content: { subject: 'hello\r\nBcc: attacker@example.com', html: 'body' }, error: 'subject' },
    { route: 'user@example.com', content: { subject: 'ok', html: '' }, error: 'html' },
    { route: Array.from({ length: 51 }, (_, index) => `u${index}@example.com`), content: { subject: 'ok', html: 'body' }, error: 'recipients' },
  ])('rejects invalid and abusive mail input', async ({ route, content, error }) => {
    const send = vi.fn()
    await expect(new MailNotificationChannel({ send }).send(recipient(route), new WelcomeNotification(content))).rejects.toThrow(error)
    expect(send).not.toHaveBeenCalled()
  })
})

import { describe, expect, it } from 'vitest'
import { Notification, type Notifiable } from '../../src/runtime/contracts'
import { NotificationFake } from '../../src/runtime/testing/NotificationFake'

class WelcomeNotification extends Notification {
  constructor(readonly message: string) { super() }
  via(): readonly string[] { return ['mail', 'database'] }
}

describe('NotificationFake', () => {
  it('matches notification state and delivery channels', async () => {
    const fake = new NotificationFake()
    const recipient: Notifiable = { routeNotificationFor: () => null }

    await fake.send(recipient, new WelcomeNotification('hello'))

    fake.assertSentTo(recipient, WelcomeNotification, (notification, channels) => notification.message === 'hello' && channels.includes('mail'))
    expect(() => fake.assertSentTo(recipient, WelcomeNotification, notification => notification.message === 'other')).toThrow('Expected WelcomeNotification')
  })

  it('asserts recipient, type, total counts and negative matches', async () => {
    const fake = new NotificationFake()
    const first: Notifiable = { routeNotificationFor: () => null }
    const second: Notifiable = { routeNotificationFor: () => null }

    await fake.send([first, second], new WelcomeNotification('first'))
    await fake.send(first, new WelcomeNotification('second'))

    fake.assertSentToTimes(first, WelcomeNotification, 2)
    fake.assertSentTimes(WelcomeNotification, 3)
    fake.assertNotSentTo(second, WelcomeNotification, notification => notification.message === 'second')
    fake.assertCount(3)
    expect(() => fake.assertNothingSent()).toThrow('received 3')

    fake.reset()
    fake.assertNothingSent()
  })

  it('rejects invalid expected counts', () => {
    const fake = new NotificationFake()

    expect(() => fake.assertCount(-1)).toThrow('non-negative safe integer')
    expect(() => fake.assertSentTimes(WelcomeNotification, 1.5)).toThrow('non-negative safe integer')
  })
})

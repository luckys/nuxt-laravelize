import { describe, expect, it } from 'vitest'

import { Mailable } from '../../src/mail/Mailable'
import { Notification } from '../../src/notifications/Notification'
import type { Notifiable } from '../../src/notifications/Notifiable'
import { Job } from '../../src/queue/Job'

import { FakeDispatcher } from '../../src/runtime/testing/fakes/FakeDispatcher'
import { FakeQueue } from '../../src/runtime/testing/fakes/FakeQueue'
import { FakeMailer } from '../../src/runtime/testing/fakes/FakeMailer'
import { FakeNotificationManager } from '../../src/runtime/testing/fakes/FakeNotificationManager'
import { FakeLogger } from '../../src/runtime/testing/fakes/FakeLogger'
import { mountLaravelize } from '../../src/runtime/testing/mountLaravelize'

class UserSignedUp { constructor(readonly id: string) {} }
class OtherEvent { constructor(readonly value: number) {} }

class WelcomeMail extends Mailable {
  constructor(private readonly recipient: string) { super() }
  to() { return this.recipient }
  subject() { return 's' }
  render() { return 'h' }
}

class WelcomeNotification extends Notification { via() { return ['mail' as const] } }

class TestJob extends Job {
  override async handle() {}
  override serialize() { return { name: 'TestJob', args: [] as const } }
}

describe('FakeDispatcher', () => {
  it('records dispatched events and matches with assertDispatched', async () => {
    const d = new FakeDispatcher()
    await d.dispatch(new UserSignedUp('u1'))
    await d.dispatch(new OtherEvent(42))
    d.assertDispatched(UserSignedUp)
    d.assertDispatched(UserSignedUp, (e) => e.id === 'u1')
    d.assertNotDispatched(class Foo {})
  })

  it('assertNothingDispatched throws when something was dispatched', async () => {
    const d = new FakeDispatcher()
    await d.dispatch(new UserSignedUp('u'))
    expect(() => d.assertNothingDispatched()).toThrow()
  })

  it('reset clears recorded events', async () => {
    const d = new FakeDispatcher()
    await d.dispatch(new UserSignedUp('u'))
    d.reset()
    d.assertNothingDispatched()
  })
})

describe('FakeQueue', () => {
  it('records pushed jobs and asserts by class', async () => {
    const q = new FakeQueue()
    await q.push(new TestJob())
    q.assertQueued(TestJob)
    expect(await q.size()).toBe(1)
  })

  it('clear works per queue', async () => {
    const q = new FakeQueue()
    await q.push(new TestJob(), { queue: 'a' })
    await q.push(new TestJob(), { queue: 'b' })
    await q.clear('a')
    expect(await q.size('a')).toBe(0)
    expect(await q.size('b')).toBe(1)
  })
})

describe('FakeMailer', () => {
  it('records sent mailables', async () => {
    const m = new FakeMailer()
    await m.send(new WelcomeMail('ada@x.com'))
    m.assertMailed(WelcomeMail, (mail) => mail.to() === 'ada@x.com')
  })
})

describe('FakeNotificationManager', () => {
  it('records sent notifications', async () => {
    const n = new FakeNotificationManager()
    const user: Notifiable = { routeNotificationFor: () => 'ada@x.com' }
    await n.send(user, new WelcomeNotification())
    n.assertSent(WelcomeNotification)
    n.assertSentTo(user, WelcomeNotification)
  })
})

describe('FakeLogger', () => {
  it('records records and hasMessage matches by level + message', () => {
    const logger = new FakeLogger()
    logger.info('hello', { id: 1 })
    logger.error('boom')
    expect(logger.hasMessage('info', 'hello')).toBe(true)
    expect(logger.hasMessage('warn', 'hello')).toBe(false)
  })
})

describe('mountLaravelize', () => {
  it('wires every fake into a container under the canonical tokens', async () => {
    const harness = await mountLaravelize({
      fakes: { dispatcher: true, queue: true, mailer: true, notifications: true, logger: true },
    })
    expect(harness.dispatcher).toBeInstanceOf(FakeDispatcher)
    expect(harness.queue).toBeInstanceOf(FakeQueue)
    expect(harness.mailer).toBeInstanceOf(FakeMailer)
    expect(harness.notifications).toBeInstanceOf(FakeNotificationManager)
    expect(harness.logger).toBeInstanceOf(FakeLogger)
  })

  it('leaves fakes null when not requested', async () => {
    const harness = await mountLaravelize()
    expect(harness.dispatcher).toBeNull()
    expect(harness.queue).toBeNull()
    expect(harness.mailer).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { Mailable } from '../../src/mail/Mailable'
import { LogMailer } from '../../src/mail/drivers/LogMailer'
import { NodemailerMailer, type NodemailerTransport } from '../../src/mail/drivers/NodemailerMailer'
import { ResendMailer, type ResendClient } from '../../src/mail/drivers/ResendMailer'
import type { Logger } from '../../src/logging/Logger'

class WelcomeMail extends Mailable {
  constructor(private readonly recipient: string, private readonly name: string) { super() }
  to() { return this.recipient }
  override from() { return 'no-reply@example.com' }
  subject() { return `Welcome, ${this.name}` }
  render() { return `<p>Hello ${this.name}</p>` }
  override text() { return `Hello ${this.name}` }
}

function recordingLogger(): { logger: Logger; calls: Array<{ message: string; context: unknown }> } {
  const calls: Array<{ message: string; context: unknown }> = []
  const logger: Logger = {
    debug: () => {},
    info: (m, c) => calls.push({ message: m, context: c }),
    warn: () => {},
    error: () => {},
    critical: () => {},
  }
  return { logger, calls }
}

describe('Mailable', () => {
  it('toMessage assembles to/from/subject/html/text/attachments', async () => {
    const mail = new WelcomeMail('ada@example.com', 'Ada')
    const message = await mail.toMessage()
    expect(message).toEqual({
      to: ['ada@example.com'],
      from: 'no-reply@example.com',
      subject: 'Welcome, Ada',
      html: '<p>Hello Ada</p>',
      text: 'Hello Ada',
      attachments: [],
    })
  })

  it('supports an array of recipients', async () => {
    class MultiMail extends Mailable {
      to() { return ['a@x.com', 'b@x.com'] }
      subject() { return 's' }
      render() { return 'h' }
    }
    const message = await new MultiMail().toMessage()
    expect(message.to).toEqual(['a@x.com', 'b@x.com'])
  })
})

describe('LogMailer', () => {
  it('logs to/from/subject without leaking the body', async () => {
    const { logger, calls } = recordingLogger()
    const mailer = new LogMailer(logger)
    await mailer.send(new WelcomeMail('ada@example.com', 'Ada'))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.message).toBe('mail dispatched')
    expect(calls[0]?.context).toMatchObject({
      to: ['ada@example.com'],
      subject: 'Welcome, Ada',
      hasText: true,
      attachments: 0,
    })
  })
})

describe('NodemailerMailer', () => {
  it('forwards a payload to the transport with the assembled message', async () => {
    const received: unknown[] = []
    const transport: NodemailerTransport = { sendMail: async (opts) => { received.push(opts); return null } }
    const mailer = new NodemailerMailer(transport, 'default@x.com')
    await mailer.send(new WelcomeMail('ada@example.com', 'Ada'))
    expect(received[0]).toMatchObject({
      to: ['ada@example.com'],
      from: 'no-reply@example.com',
      subject: 'Welcome, Ada',
      html: '<p>Hello Ada</p>',
      text: 'Hello Ada',
    })
  })

  it('uses defaultFrom when the mailable has no from()', async () => {
    class NoFromMail extends Mailable {
      to() { return 'ada@example.com' }
      subject() { return 's' }
      render() { return 'h' }
    }
    const received: unknown[] = []
    const transport: NodemailerTransport = { sendMail: async (opts) => { received.push(opts); return null } }
    const mailer = new NodemailerMailer(transport, 'fallback@x.com')
    await mailer.send(new NoFromMail())
    expect((received[0] as { from: string }).from).toBe('fallback@x.com')
  })
})

describe('ResendMailer', () => {
  it('forwards a payload to client.emails.send', async () => {
    const received: unknown[] = []
    const client: ResendClient = {
      emails: { send: async (payload) => { received.push(payload); return null } },
    }
    const mailer = new ResendMailer(client, 'default@x.com')
    await mailer.send(new WelcomeMail('ada@example.com', 'Ada'))
    expect(received[0]).toMatchObject({
      to: ['ada@example.com'],
      from: 'no-reply@example.com',
      subject: 'Welcome, Ada',
      html: '<p>Hello Ada</p>',
    })
  })
})

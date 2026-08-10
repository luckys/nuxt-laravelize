import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { describe, expect, it, vi } from 'vitest'
import { Mailable, ResendMailer } from '../../src/runtime/index'
import MailServiceProvider from '../../src/runtime/server/MailServiceProvider'
import { mailerToken } from '../../src/runtime/tokens'

class WelcomeMail extends Mailable {
  to(): string { return 'user@example.com' }
  subject(): string { return 'Welcome' }
  render(): string { return '<p>Welcome</p>' }
}

describe('ResendMailer', () => {
  it('sends the rendered message through a structural client', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const signal = new AbortController().signal
    await new ResendMailer({ emails: { send } }, 'from@example.com').send(new WelcomeMail(), { idempotencyKey: 'delivery-1', locale: 'es', signal })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Welcome', from: 'from@example.com' }), { idempotencyKey: 'delivery-1', signal })
  })

  it('fails before invoking the transport when delivery was aborted', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    await expect(new ResendMailer({ emails: { send } }, 'from@example.com').send(new WelcomeMail(), { signal: controller.signal })).rejects.toThrow('stopped')
    expect(send).not.toHaveBeenCalled()
  })
})

describe('MailServiceProvider', () => {
  it('delivers through the fallback logger when no application logger is registered', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const container = createContainer()
    new MailServiceProvider().register(container)

    await container.make(mailerToken).send(new WelcomeMail())

    expect(info).toHaveBeenCalledWith('[INFO]', 'mail dispatched', expect.objectContaining({ subject: 'Welcome' }))
    info.mockRestore()
  })
})

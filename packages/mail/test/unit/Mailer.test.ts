import { describe, expect, it, vi } from 'vitest'
import { Mailable, ResendMailer } from '../../src/runtime/index'

class WelcomeMail extends Mailable {
  to(): string { return 'user@example.com' }
  subject(): string { return 'Welcome' }
  render(): string { return '<p>Welcome</p>' }
}

describe('ResendMailer', () => {
  it('sends the rendered message through a structural client', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await new ResendMailer({ emails: { send } }, 'from@example.com').send(new WelcomeMail())
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Welcome', from: 'from@example.com' }))
  })
})

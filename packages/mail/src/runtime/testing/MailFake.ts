import type { Mailable } from '../Mailable'
import type { Mailer, MailSendOptions } from '../Mailer'

export class MailFake implements Mailer {
  readonly sent: Mailable[] = []
  readonly options: MailSendOptions[] = []
  async send(mailable: Mailable, options: MailSendOptions = {}): Promise<void> {
    options.signal?.throwIfAborted()
    this.sent.push(mailable)
    this.options.push(options)
  }

  reset(): void {
    this.sent.length = 0
    this.options.length = 0
  }

  assertSent<T extends Mailable>(type: new (...args: never[]) => T): void {
    if (!this.sent.some(mail => mail instanceof type)) throw new Error(`Expected ${type.name} to be sent.`)
  }
}

import type { Mailable } from '../Mailable'
import type { Mailer } from '../Mailer'

export class MailFake implements Mailer {
  readonly sent: Mailable[] = []
  async send(mailable: Mailable): Promise<void> { this.sent.push(mailable) }
  reset(): void { this.sent.length = 0 }
  assertSent<T extends Mailable>(type: new (...args: never[]) => T): void {
    if (!this.sent.some(mail => mail instanceof type)) throw new Error(`Expected ${type.name} to be sent.`)
  }
}

import type { Mailable } from '../../../mail/Mailable'
import type { Mailer } from '../../../mail/Mailer'

export class FakeMailer implements Mailer {
  readonly sent: Mailable[] = []

  async send(mailable: Mailable): Promise<void> {
    this.sent.push(mailable)
  }

  reset(): void { this.sent.length = 0 }

  assertMailed<M extends Mailable>(
    mailableClass: new (...args: never[]) => M,
    matcher?: (mailable: M) => boolean,
  ): void {
    const matches = this.sent.filter((m) => m instanceof mailableClass) as M[]
    if (matches.length === 0) {
      throw new Error(`Expected a mailable of type ${mailableClass.name} to be sent, none were.`)
    }
    if (matcher !== undefined && !matches.some(matcher)) {
      throw new Error(`Sent ${mailableClass.name} mailables did not match the predicate.`)
    }
  }

  assertNothingMailed(): void {
    if (this.sent.length > 0) {
      throw new Error(`Expected no mailables sent, but got ${this.sent.length}.`)
    }
  }
}

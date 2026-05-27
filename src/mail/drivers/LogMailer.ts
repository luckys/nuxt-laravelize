import type { Logger } from '../../logging/Logger'
import type { Mailable } from '../Mailable'
import type { Mailer } from '../Mailer'

export class LogMailer implements Mailer {
  constructor(private readonly logger: Logger) {}

  async send(mailable: Mailable): Promise<void> {
    const message = await mailable.toMessage()
    this.logger.info('mail dispatched', {
      to: message.to,
      from: message.from,
      subject: message.subject,
      hasText: message.text !== undefined,
      attachments: message.attachments.length,
    })
  }
}

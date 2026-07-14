import type { Mailable } from '../Mailable'
import type { Mailer } from '../Mailer'

export interface NodemailerTransport {
  sendMail(options: { to: readonly string[], from?: string, subject: string, html: string, text?: string, attachments?: readonly unknown[] }): Promise<unknown>
}

export class NodemailerMailer implements Mailer {
  constructor(private readonly transport: NodemailerTransport, private readonly defaultFrom?: string) {}
  async send(mailable: Mailable): Promise<void> {
    const message = await mailable.toMessage()
    await this.transport.sendMail({
      to: message.to,
      from: message.from ?? this.defaultFrom,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments.length ? message.attachments : undefined,
    })
  }
}

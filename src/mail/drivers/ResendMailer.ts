import type { Mailable } from '../Mailable'
import type { Mailer } from '../Mailer'

export interface ResendClient {
  emails: {
    send(payload: {
      to: string | string[]
      from: string
      subject: string
      html?: string
      text?: string
      attachments?: ReadonlyArray<{ filename: string; content: string | Uint8Array }>
    }): Promise<unknown>
  }
}

export class ResendMailer implements Mailer {
  constructor(private readonly client: ResendClient, private readonly defaultFrom: string) {}

  async send(mailable: Mailable): Promise<void> {
    const message = await mailable.toMessage()
    await this.client.emails.send({
      to: [...message.to],
      from: message.from ?? this.defaultFrom,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachments.length > 0
        ? message.attachments.map((a) => ({ filename: a.filename, content: a.content }))
        : undefined,
    })
  }
}

import type { Attachment, MailMessage } from './MailMessage'

export abstract class Mailable {
  abstract to(): string | readonly string[]
  from(): string | undefined { return undefined }
  abstract subject(): string
  abstract render(): string | Promise<string>
  text(): string | Promise<string> | undefined { return undefined }
  attachments(): readonly Attachment[] { return [] }

  async toMessage(): Promise<MailMessage> {
    const recipients = this.to()
    return {
      to: typeof recipients === 'string' ? [recipients] : [...recipients],
      from: this.from(),
      subject: this.subject(),
      html: await this.render(),
      text: await this.text(),
      attachments: [...this.attachments()],
    }
  }
}

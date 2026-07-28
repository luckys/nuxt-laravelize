import { Mailable, type Attachment, type Mailer } from '@nuxt-laravelize/mail/runtime'
import type { Notifiable, Notification, NotificationChannel, NotificationDeliveryContext } from '@nuxt-laravelize/notifications/runtime'

const MAX_RECIPIENTS = 50
const MAX_ADDRESS = 320
const MAX_SUBJECT = 256
const MAX_BODY = 1_048_576
const MAX_ATTACHMENTS = 20
const MAX_ATTACHMENT_BYTES = 10_485_760
const CONTROL = /[\r\n\0]/
const ADDRESS = /^[^\s,;<>@]+@[^\s,;<>@]+$/
const encoder = new TextEncoder()

export interface MailNotificationContent {
  readonly subject: string
  readonly html: string
  readonly text?: string
  readonly from?: string
  readonly attachments?: readonly Attachment[]
}

interface MailNotification extends Notification {
  toMail(notifiable: Notifiable, context?: NotificationDeliveryContext): MailNotificationContent | Promise<MailNotificationContent>
}

export class InvalidMailNotificationError extends TypeError {
  constructor(field: string) {
    super(`Invalid mail notification ${field}`)
    this.name = 'InvalidMailNotificationError'
  }
}

class NotificationMailable extends Mailable {
  constructor(private readonly recipients: readonly string[], private readonly content: MailNotificationContent) { super() }
  to(): readonly string[] { return this.recipients }
  override from(): string | undefined { return this.content.from }
  subject(): string { return this.content.subject }
  render(): string { return this.content.html }
  override text(): string | undefined { return this.content.text }
  override attachments(): readonly Attachment[] { return this.content.attachments ?? [] }
}

export class MailNotificationChannel implements NotificationChannel {
  constructor(private readonly mailer: Mailer) {}

  async send(notifiable: Notifiable, notification: Notification, context?: NotificationDeliveryContext): Promise<void> {
    context?.signal?.throwIfAborted()
    const route = notifiable.routeNotificationFor('mail', notification)
    const recipients = readRecipients(route)
    if (!isMailNotification(notification)) throw new InvalidMailNotificationError('content')
    const content = validateContent(await notification.toMail(notifiable, context))
    context?.signal?.throwIfAborted()
    await this.mailer.send(new NotificationMailable(recipients, content), context)
  }
}

function isMailNotification(notification: Notification): notification is MailNotification {
  return typeof notification.toMail === 'function'
}

function readRecipients(value: unknown): readonly string[] {
  const raw = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  if (!raw.length || raw.length > MAX_RECIPIENTS) throw new InvalidMailNotificationError('recipients')
  const recipients: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') throw new InvalidMailNotificationError('recipient')
    const address = item.trim()
    if (!validAddress(address)) throw new InvalidMailNotificationError('recipient')
    const key = address.toLocaleLowerCase('en-US')
    if (!seen.has(key)) {
      seen.add(key)
      recipients.push(address)
    }
  }
  if (!recipients.length) throw new InvalidMailNotificationError('recipients')
  return recipients
}

function validateContent(value: unknown): MailNotificationContent {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new InvalidMailNotificationError('content')
  const input = value as Record<string, unknown>
  if ('to' in input || 'cc' in input || 'bcc' in input || 'replyTo' in input) throw new InvalidMailNotificationError('destination')
  const subject = boundedText(input.subject, 'subject', MAX_SUBJECT, true)
  const html = boundedText(input.html, 'html', MAX_BODY, false)
  const text = input.text === undefined ? undefined : boundedText(input.text, 'text', MAX_BODY, false)
  const from = input.from === undefined ? undefined : mailAddress(input.from, 'from')
  const attachments = validateAttachments(input.attachments)
  return { subject, html, ...(text !== undefined ? { text } : {}), ...(from !== undefined ? { from } : {}), ...(attachments.length ? { attachments } : {}) }
}

function mailAddress(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new InvalidMailNotificationError(field)
  const address = value.trim()
  if (!validAddress(address)) throw new InvalidMailNotificationError(field)
  return address
}

function validAddress(value: string): boolean {
  return Boolean(value) && value.length <= MAX_ADDRESS && !CONTROL.test(value) && ADDRESS.test(value)
}

function boundedText(value: unknown, field: string, maximum: number, header: boolean): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || (header && CONTROL.test(value))) throw new InvalidMailNotificationError(field)
  return value
}

function validateAttachments(value: unknown): readonly Attachment[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new InvalidMailNotificationError('attachments')
  let bytes = 0
  return value.map((item) => {
    if (!item || Object.getPrototypeOf(item) !== Object.prototype) throw new InvalidMailNotificationError('attachment')
    const attachment = item as Partial<Attachment>
    const filename = boundedText(attachment.filename, 'attachment filename', 255, true)
    if (typeof attachment.content !== 'string' && !(attachment.content instanceof Uint8Array)) throw new InvalidMailNotificationError('attachment content')
    bytes += typeof attachment.content === 'string' ? encoder.encode(attachment.content).byteLength : attachment.content.byteLength
    if (bytes > MAX_ATTACHMENT_BYTES) throw new InvalidMailNotificationError('attachments size')
    const contentType = attachment.contentType === undefined ? undefined : boundedText(attachment.contentType, 'attachment content type', 127, true)
    return { filename, content: attachment.content, ...(contentType ? { contentType } : {}) }
  })
}

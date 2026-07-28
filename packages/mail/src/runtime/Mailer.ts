import type { Mailable } from './Mailable'

export interface MailSendOptions {
  readonly idempotencyKey?: string
  readonly locale?: string
  readonly signal?: AbortSignal
}

export interface Mailer { send(mailable: Mailable, options?: MailSendOptions): Promise<void> }

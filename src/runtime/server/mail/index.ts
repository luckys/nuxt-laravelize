import type { H3Event } from 'h3'

import { mailerToken } from '../../../mail/MailerToken'
import type { Mailer } from '../../../mail/Mailer'
import { useContainer } from '../utils/useContainer'

export function useMailer(event: H3Event): Mailer {
  const container = useContainer(event)
  return container.make(mailerToken)
}

export { Mailable } from '../../../mail/Mailable'
export { mailerToken } from '../../../mail/MailerToken'
export type { Mailer, MailMessage, Attachment } from '../../../mail/index'

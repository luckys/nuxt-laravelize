import type { Mailable } from './Mailable'

export interface Mailer {
  send(mailable: Mailable): Promise<void>
}

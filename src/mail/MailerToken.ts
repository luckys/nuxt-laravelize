import { createToken } from '../core/container/Token'
import type { Mailer } from './Mailer'

export const mailerToken = createToken<Mailer>('laravelize.mailer')

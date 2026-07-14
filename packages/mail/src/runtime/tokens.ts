import { createToken } from '@nuxt-laravelize/core/runtime'
import type { Mailer } from './Mailer'

export const mailerToken = createToken<Mailer>('laravelize.mailer')

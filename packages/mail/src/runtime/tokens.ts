import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Mailer } from './Mailer'

export const mailerToken = createToken<Mailer>('laravelize.mailer')

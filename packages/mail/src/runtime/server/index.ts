import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'

import type { Mailer } from '../Mailer'
import { mailerToken } from '../tokens'

export function useMailer(event: Parameters<typeof useContainer>[0]): Mailer {
  return useContainer(event).make(mailerToken)
}

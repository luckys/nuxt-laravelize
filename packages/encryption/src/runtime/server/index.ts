import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { Encrypter } from '../Encrypter'
import { encrypterToken } from '../tokens'

export { encrypterToken } from '../tokens'

export function useEncrypter(event: H3Event): Encrypter {
  return useContainer(event).make(encrypterToken)
}

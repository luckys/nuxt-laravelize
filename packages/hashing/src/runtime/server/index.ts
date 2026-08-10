import type { H3Event } from 'h3'
import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'

import type { Hasher } from '../Hasher'
import { hasherToken } from '../tokens'

export { hasherToken } from '../tokens'

export function useHasher(event: H3Event): Hasher {
  return useContainer(event).make(hasherToken)
}

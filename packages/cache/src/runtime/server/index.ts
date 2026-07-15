import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { Cache } from '../Cache'
import { cacheToken } from '../tokens'

export { cacheToken } from '../tokens'

export function useCache(event: H3Event): Cache {
  return useContainer(event).make(cacheToken)
}

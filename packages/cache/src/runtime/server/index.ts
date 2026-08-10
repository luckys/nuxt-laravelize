import type { H3Event } from 'h3'
import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'

import type { Cache } from '../Cache'
import { CacheLock } from '../CacheLock'
import { cacheToken } from '../tokens'

export { cacheToken } from '../tokens'

export function useCache(event: H3Event): Cache {
  return useContainer(event).make(cacheToken)
}

export function useCacheLock(event: H3Event, name: string, ttlSeconds: number, owner?: string): CacheLock {
  return new CacheLock(useCache(event), name, ttlSeconds, owner)
}

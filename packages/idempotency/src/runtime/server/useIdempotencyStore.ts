import type { Container } from '@nuxt-laravelize/core/runtime'
import type { H3Event } from 'h3'
import type { IdempotencyStore } from '../store'
import { idempotencyStoreToken } from '../tokens'

export function useIdempotencyStore(event: H3Event): IdempotencyStore {
  const container = event.context.laravelizeContainer as Container | undefined
  if (!container) throw new Error('Laravelize container is not available on this H3 event.')
  return container.make(idempotencyStoreToken)
}

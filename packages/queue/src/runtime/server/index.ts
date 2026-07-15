import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { Queue } from '../Queue'
import { queueToken } from '../tokens'

export function useQueue(event: Parameters<typeof useContainer>[0]): Queue {
  return useContainer(event).make(queueToken)
}

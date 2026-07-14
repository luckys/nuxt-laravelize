import { useContainer } from '@nuxt-laravelize/core/runtime/server'

import type { Dispatcher } from '../contracts'
import { dispatcherToken } from '../tokens'

export function useDispatcher(event: Parameters<typeof useContainer>[0]): Dispatcher {
  return useContainer(event).make(dispatcherToken)
}

export { dispatcherToken }

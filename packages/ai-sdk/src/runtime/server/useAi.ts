import type { H3Event } from 'h3'
import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'

import { aiClientToken, type AiClient } from '../index'

export function useAi(event: H3Event): AiClient {
  return useContainer(event).make(aiClientToken)
}

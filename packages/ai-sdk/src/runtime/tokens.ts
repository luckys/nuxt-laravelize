import { createToken } from '@nuxt-laravelize/core/runtime'

import type { AiConnectionRegistry } from './AiConnectionRegistry'
import type { AiClient } from './types'

export const aiConnectionsToken = createToken<AiConnectionRegistry>('laravelize.ai.connections')
export const aiClientToken = createToken<AiClient>('laravelize.ai.client')

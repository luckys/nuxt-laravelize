import { createToken } from '@nuxt-laravelize/core/runtime'

import type { Gate } from './Gate'

export const gateToken = createToken<Gate>('laravelize.gate')

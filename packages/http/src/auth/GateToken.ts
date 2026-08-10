import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { Gate } from './Gate'

export const gateToken = createToken<Gate>('laravelize.gate')

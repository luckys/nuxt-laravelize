import { createToken } from '../core/container/Token'

import type { Gate } from './Gate'

export const gateToken = createToken<Gate>('laravelize.gate')

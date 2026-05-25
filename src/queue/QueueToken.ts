import { createToken } from '../core/container/Token'

import type { Queue } from './Queue'

export const queueToken = createToken<Queue>('laravelize.queue')

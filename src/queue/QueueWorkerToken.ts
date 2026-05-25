import { createToken } from '../core/container/Token'

import type { QueueWorker } from './QueueWorker'

export const queueWorkerToken = createToken<QueueWorker>('laravelize.queue-worker')

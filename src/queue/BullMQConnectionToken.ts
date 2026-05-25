import { createToken } from '../core/container/Token'

import type { BullMQConnection } from './BullMQConnection'

export const bullmqConnectionToken = createToken<BullMQConnection>('laravelize.bullmq-connection')

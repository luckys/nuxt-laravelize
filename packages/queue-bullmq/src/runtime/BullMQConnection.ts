import type { Redis } from 'ioredis'
import { FailureReporter } from './FailureReporter'

export class BullMQConnection {
  readonly failures = new FailureReporter()
  constructor(readonly client: Redis) {}
}

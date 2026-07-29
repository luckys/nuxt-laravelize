import type { Cluster, Redis } from 'ioredis'
import { FailureReporter } from './FailureReporter'

export interface BullMQConnectionOptions {
  readonly prefix?: string
}

export type BullMQRedisClient = Redis | Cluster

export class BullMQConnection {
  readonly failures = new FailureReporter()
  readonly prefix?: string
  constructor(readonly client: BullMQRedisClient, options: BullMQConnectionOptions = {}) {
    if (options.prefix !== undefined && (typeof options.prefix !== 'string' || !/^(?:[A-Z0-9][\w.:-]{0,127}|\{[A-Z0-9][\w.:-]{0,125}\})$/i.test(options.prefix))) {
      throw new TypeError('BullMQ prefix must be a safe identifier or Redis Cluster hash tag of at most 128 characters')
    }
    this.prefix = options.prefix
  }
}

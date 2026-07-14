import type { Redis } from 'ioredis'

export class BullMQConnection {
  constructor(readonly client: Redis) {}
}

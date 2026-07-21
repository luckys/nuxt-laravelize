import type { SQL } from 'drizzle-orm'
import { DrizzleIdempotencyStore } from './base.js'

export interface DrizzlePostgresIdempotencyDatabase { execute(query: SQL): unknown | PromiseLike<unknown> }

export class DrizzlePostgresIdempotencyStore extends DrizzleIdempotencyStore {
  constructor(database: DrizzlePostgresIdempotencyDatabase) {
    super(query => database.execute(query))
  }
}

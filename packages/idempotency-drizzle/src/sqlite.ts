import type { SQL } from 'drizzle-orm'
import { DrizzleIdempotencyStore } from './base.js'

export interface DrizzleSQLiteIdempotencyDatabase { all(query: SQL): unknown | PromiseLike<unknown> }

export class DrizzleSQLiteIdempotencyStore extends DrizzleIdempotencyStore {
  constructor(database: DrizzleSQLiteIdempotencyDatabase) {
    super(query => database.all(query))
  }
}

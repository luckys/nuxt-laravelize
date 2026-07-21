import type { SQL } from 'drizzle-orm'
import { DrizzleWorkflowStore, postgresRows } from './base.js'

export interface DrizzlePostgresWorkflowDatabase {
  execute(query: SQL): unknown | PromiseLike<unknown>
}

export class DrizzlePostgresWorkflowStore extends DrizzleWorkflowStore {
  constructor(database: DrizzlePostgresWorkflowDatabase) {
    super(async query => postgresRows(await database.execute(query)))
  }
}

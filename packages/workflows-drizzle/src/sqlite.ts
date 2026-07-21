import type { SQL } from 'drizzle-orm'
import { DrizzleWorkflowStore } from './base.js'

type Row = Record<string, unknown>

export interface DrizzleSQLiteWorkflowDatabase {
  all(query: SQL): Row[] | PromiseLike<Row[]>
}

export class DrizzleSQLiteWorkflowStore extends DrizzleWorkflowStore {
  constructor(database: DrizzleSQLiteWorkflowDatabase) {
    super(query => database.all(query))
  }
}

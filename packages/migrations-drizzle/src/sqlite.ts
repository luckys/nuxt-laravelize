import type { FreshOwnership, MigrationBackend, MigrationRecord, MigrationTransaction } from '@luckys_luis/nuxt-laravelize-migrations'
import { assertIdentifier, assertOwnership, failureWithCleanup, mapRecord, quoteIdentifier } from './shared.js'

export interface SQLiteMigrationTransactionClient { run(sql: string, parameters?: readonly unknown[]): unknown | PromiseLike<unknown>, all(sql: string, parameters?: readonly unknown[]): readonly Record<string, unknown>[] | PromiseLike<readonly Record<string, unknown>[]> }
export interface SQLiteMigrationClient extends SQLiteMigrationTransactionClient { transaction<T>(callback: (client: SQLiteMigrationTransactionClient) => Promise<T>, options?: { behavior?: 'immediate' }): Promise<T> }
export interface SQLiteMigrationBackendOptions { historyTable?: string, lockTable?: string, ownershipPrefix?: string }

export class SQLiteMigrationBackend implements MigrationBackend<'sqlite'> {
  readonly dialect = 'sqlite' as const
  readonly #historyName: string
  readonly #lockName: string
  readonly #history: string
  readonly #locks: string
  readonly #ownershipPrefix?: string
  #initialized?: Promise<void>
  constructor(private readonly client: SQLiteMigrationClient, options: SQLiteMigrationBackendOptions = {}) {
    const history = options.historyTable ?? 'laravelize_migrations'
    const locks = options.lockTable ?? 'laravelize_migration_locks'
    assertIdentifier(history, 'History table')
    assertIdentifier(locks, 'Lock table')
    this.#historyName = history
    this.#lockName = locks
    this.#history = quoteIdentifier(history)
    this.#locks = quoteIdentifier(locks)
    if (options.ownershipPrefix) assertIdentifier(`${options.ownershipPrefix}x`, 'ownershipPrefix')
    this.#ownershipPrefix = options.ownershipPrefix
  }

  async list(): Promise<readonly MigrationRecord[]> {
    await this.ensureSchema()
    return new SQLiteUnit(this.client, this.#historyName, this.#lockName, this.#ownershipPrefix).list()
  }

  async withLockedTransaction<T>(name: string, callback: (transaction: MigrationTransaction<'sqlite'>) => Promise<T>): Promise<T> {
    await this.ensureSchema()
    let callbackFailed = false
    let callbackPrimaryError: unknown
    let callbackThrownError: unknown
    let callbackCleanupErrors: unknown[] = []
    try {
      return await this.client.transaction(async (client) => {
        let locked = false
        let failed = false
        let primaryError: unknown
        let result!: T
        const cleanupErrors: unknown[] = []
        try {
          await client.run(`INSERT INTO ${this.#locks} (name, acquired_at) VALUES (?, ?)`, [name, new Date().toISOString()])
          locked = true
          result = await callback(new SQLiteUnit(client, this.#historyName, this.#lockName, this.#ownershipPrefix))
        }
        catch (error) {
          failed = true
          primaryError = error
        }
        if (locked) {
          try {
            await client.run(`DELETE FROM ${this.#locks} WHERE name = ?`, [name])
          }
          catch (error) { cleanupErrors.push(error) }
        }
        if (failed || cleanupErrors.length) {
          callbackFailed = true
          callbackPrimaryError = failed ? primaryError : cleanupErrors[0]
          callbackCleanupErrors = failed ? cleanupErrors : cleanupErrors.slice(1)
          callbackThrownError = failureWithCleanup(callbackPrimaryError, callbackCleanupErrors, 'SQLite migration failed and lock-row cleanup reported additional errors.')
          throw callbackThrownError
        }
        return result
      }, { behavior: 'immediate' })
    }
    catch (transactionError) {
      if (!callbackFailed || transactionError === callbackThrownError) throw transactionError
      throw failureWithCleanup(callbackPrimaryError, [...callbackCleanupErrors, transactionError], 'SQLite migration failed and cleanup reported additional errors.')
    }
  }

  private ensureSchema(): Promise<void> {
    return this.#initialized ??= (async () => {
      await this.client.run(`CREATE TABLE IF NOT EXISTS ${this.#history} (id TEXT PRIMARY KEY, namespace TEXT NOT NULL, name TEXT NOT NULL, checksum TEXT NOT NULL, batch INTEGER NOT NULL CHECK (batch > 0), applied_at TEXT NOT NULL)`)
      await this.client.run(`CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#historyName}_batch_idx`)} ON ${this.#history} (batch, applied_at)`)
      await this.client.run(`CREATE TABLE IF NOT EXISTS ${this.#locks} (name TEXT PRIMARY KEY, acquired_at TEXT NOT NULL)`)
    })().catch((error) => {
      this.#initialized = undefined
      throw error
    })
  }
}

class SQLiteUnit implements MigrationTransaction<'sqlite'> {
  readonly dialect = 'sqlite' as const
  readonly #history: string
  constructor(private readonly client: SQLiteMigrationTransactionClient, private readonly historyName: string, private readonly lockName: string, private readonly ownershipPrefix?: string) { this.#history = quoteIdentifier(historyName) }
  async execute(sql: string, parameters?: readonly unknown[]): Promise<void> { await this.client.run(sql, parameters) }
  async list(): Promise<readonly MigrationRecord[]> { return (await this.client.all(`SELECT id, namespace, name, checksum, batch, applied_at FROM ${this.#history} ORDER BY batch, applied_at, id`)).map(mapRecord) }
  async record(record: MigrationRecord): Promise<void> { await this.client.run(`INSERT INTO ${this.#history} (id, namespace, name, checksum, batch, applied_at) VALUES (?, ?, ?, ?, ?, ?)`, [record.id, record.namespace, record.name, record.checksum, record.batch, record.appliedAt]) }
  async remove(id: string): Promise<void> { await this.client.run(`DELETE FROM ${this.#history} WHERE id = ?`, [id]) }
  async clear(): Promise<void> { await this.client.run(`DELETE FROM ${this.#history}`) }
  async dropOwned(ownership: FreshOwnership): Promise<void> {
    assertOwnership(ownership, this.ownershipPrefix)
    if (ownership.objects.some(object => object.kind === 'schema')) throw new TypeError('SQLite does not support owned schemas')
    if (ownership.objects.some(object => object.name === this.historyName || object.name === this.lockName)) throw new TypeError('Ownership manifest must not include adapter metadata tables')
    for (const object of ownership.objects) await this.client.run(`DROP TABLE IF EXISTS ${quoteIdentifier(object.name)}`)
  }
}

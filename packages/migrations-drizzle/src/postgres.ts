import type { FreshOwnership, MigrationBackend, MigrationRecord, MigrationTransaction } from '@luckys_luis/nuxt-laravelize-migrations'
import { assertIdentifier, assertOwnership, failureWithCleanup, mapRecord, pgRows, quoteIdentifier } from './shared.js'

export interface PostgreSQLMigrationConnection { query(sql: string, parameters?: readonly unknown[]): unknown | PromiseLike<unknown> }
export interface PostgreSQLMigrationConnectionProvider {
  /** Return a dedicated, pinned session that is not shared until release. */
  acquire(): Promise<PostgreSQLMigrationConnection>
  release(connection: PostgreSQLMigrationConnection): Promise<void>
}
export interface PostgresMigrationBackendOptions { historyTable?: string, lockNamespace?: string, ownershipPrefix?: string }

export class PostgresMigrationBackend implements MigrationBackend<'postgresql'> {
  readonly dialect = 'postgresql' as const
  readonly #tableName: string
  readonly #table: string
  readonly #lockNamespace: string
  readonly #ownershipPrefix?: string
  #initialized?: Promise<void>
  constructor(private readonly connections: PostgreSQLMigrationConnectionProvider, options: PostgresMigrationBackendOptions = {}) {
    const table = options.historyTable ?? 'laravelize_migrations'
    assertIdentifier(table, 'History table')
    this.#tableName = table
    this.#table = quoteIdentifier(table)
    this.#lockNamespace = options.lockNamespace ?? 'nuxt-laravelize:migrations'
    if (!this.#lockNamespace || this.#lockNamespace.length > 200) throw new TypeError('lockNamespace must contain between 1 and 200 characters')
    if (options.ownershipPrefix) assertIdentifier(`${options.ownershipPrefix}x`, 'ownershipPrefix')
    this.#ownershipPrefix = options.ownershipPrefix
  }

  async list(): Promise<readonly MigrationRecord[]> {
    const connection = await this.connections.acquire()
    let failed = false
    let primaryError: unknown
    let records: readonly MigrationRecord[] = []
    try {
      await this.ensureSchema(connection)
      records = await new PostgresUnit(connection, this.#tableName, this.#ownershipPrefix).list()
    }
    catch (error) {
      failed = true
      primaryError = error
    }
    try {
      await this.connections.release(connection)
    }
    catch (releaseError) {
      if (failed) throw failureWithCleanup(primaryError, [releaseError], 'PostgreSQL migration history read failed and session release also failed.')
      throw releaseError
    }
    if (failed) throw primaryError
    return records
  }

  async withLockedTransaction<T>(name: string, callback: (transaction: MigrationTransaction<'postgresql'>) => Promise<T>): Promise<T> {
    const connection = await this.connections.acquire()
    let locked = false
    let began = false
    let failed = false
    let primaryError: unknown
    let result!: T
    const cleanupErrors: unknown[] = []
    try {
      await this.ensureSchema(connection)
      await connection.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`${this.#lockNamespace}:${name}`])
      locked = true
      await connection.query('BEGIN')
      began = true
      result = await callback(new PostgresUnit(connection, this.#tableName, this.#ownershipPrefix))
      await connection.query('COMMIT')
      began = false
    }
    catch (error) {
      failed = true
      primaryError = error
    }
    if (began) {
      try {
        await connection.query('ROLLBACK')
      }
      catch (error) { cleanupErrors.push(error) }
    }
    if (locked) {
      try {
        const unlockResult = await connection.query('SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked', [`${this.#lockNamespace}:${name}`])
        if (pgRows(unlockResult)[0]?.unlocked === false) throw new Error(`PostgreSQL advisory lock "${name}" was not held by the migration session.`)
      }
      catch (error) { cleanupErrors.push(error) }
    }
    try {
      await this.connections.release(connection)
    }
    catch (error) { cleanupErrors.push(error) }

    if (failed) throw failureWithCleanup(primaryError, cleanupErrors, 'PostgreSQL migration failed and cleanup reported additional errors.')
    if (cleanupErrors.length) throw failureWithCleanup(cleanupErrors[0], cleanupErrors.slice(1), 'PostgreSQL migration cleanup failed.')
    return result
  }

  private ensureSchema(connection: PostgreSQLMigrationConnection): Promise<void> {
    return this.#initialized ??= (async () => {
      await connection.query(`CREATE TABLE IF NOT EXISTS ${this.#table} (id text PRIMARY KEY, namespace text NOT NULL, name text NOT NULL, checksum text NOT NULL, batch integer NOT NULL CHECK (batch > 0), applied_at timestamptz NOT NULL)`)
      await connection.query(`CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${this.#tableName}_batch_idx`)} ON ${this.#table} (batch, applied_at)`)
    })().catch((error) => {
      this.#initialized = undefined
      throw error
    })
  }
}

class PostgresUnit implements MigrationTransaction<'postgresql'> {
  readonly dialect = 'postgresql' as const
  readonly #table: string
  constructor(private readonly connection: PostgreSQLMigrationConnection, private readonly tableName: string, private readonly ownershipPrefix?: string) { this.#table = quoteIdentifier(tableName) }
  async execute(sql: string, parameters?: readonly unknown[]): Promise<void> { await this.connection.query(sql, parameters) }
  async list(): Promise<readonly MigrationRecord[]> { return pgRows(await this.connection.query(`SELECT id, namespace, name, checksum, batch, applied_at FROM ${this.#table} ORDER BY batch, applied_at, id`)).map(mapRecord) }
  async record(record: MigrationRecord): Promise<void> { await this.connection.query(`INSERT INTO ${this.#table} (id, namespace, name, checksum, batch, applied_at) VALUES ($1, $2, $3, $4, $5, $6)`, [record.id, record.namespace, record.name, record.checksum, record.batch, record.appliedAt]) }
  async remove(id: string): Promise<void> { await this.connection.query(`DELETE FROM ${this.#table} WHERE id = $1`, [id]) }
  async clear(): Promise<void> { await this.connection.query(`DELETE FROM ${this.#table}`) }
  async dropOwned(ownership: FreshOwnership): Promise<void> {
    assertOwnership(ownership, this.ownershipPrefix)
    if (ownership.objects.some(object => object.kind === 'schema') && !this.ownershipPrefix) throw new TypeError('Dropping owned schemas requires a configured ownershipPrefix')
    if (ownership.objects.some(object => object.name === this.tableName)) throw new TypeError('Ownership manifest must not include the adapter history table')
    for (const object of ownership.objects.filter(item => item.kind === 'table')) await this.connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(object.name)}`)
    for (const object of ownership.objects.filter(item => item.kind === 'schema')) await this.connection.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(object.name)} CASCADE`)
  }
}

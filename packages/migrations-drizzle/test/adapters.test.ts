import { describe, expect, it } from 'vitest'
import type { MigrationRecord } from '@luckys_luis/nuxt-laravelize-migrations'
import { PostgresMigrationBackend, type PostgreSQLMigrationConnection } from '../src/postgres.js'
import { SQLiteMigrationBackend, type SQLiteMigrationTransactionClient } from '../src/sqlite.js'
import { createTestNamespace } from '../src/testing.js'

const record: MigrationRecord = { id: 'app:a', namespace: 'app', name: 'a', checksum: 'abc', batch: 2, appliedAt: '2026-01-01T00:00:00.000Z' }

describe('PostgresMigrationBackend', () => {
  it('pins lock, SQL, and history transaction to one acquired session and releases it', async () => {
    const calls: Array<{ session: number, sql: string, parameters?: readonly unknown[] }> = []
    const released: number[] = []
    let next = 0
    const provider = {
      async acquire(): Promise<PostgreSQLMigrationConnection> {
        const session = ++next
        return { query: async (sql, parameters) => {
          calls.push({ session, sql, ...(parameters ? { parameters } : {}) })
          return { rows: [] }
        } }
      },
      async release(connection: PostgreSQLMigrationConnection) { released.push((connection as { session?: number }).session ?? next) },
    }
    // Preserve an observable identity without weakening the production interface.
    provider.acquire = async () => {
      const session = ++next
      return { session, query: async (sql: string, parameters?: readonly unknown[]) => {
        calls.push({ session, sql, ...(parameters ? { parameters } : {}) })
        return { rows: [] }
      } } as PostgreSQLMigrationConnection
    }
    const backend = new PostgresMigrationBackend(provider)

    await backend.withLockedTransaction('deploy', async (transaction) => {
      await transaction.execute('CREATE TABLE users(id int)')
      await transaction.record(record)
    })

    const transactionCalls = calls.filter(call => call.sql.includes('advisory_') || ['BEGIN', 'COMMIT', 'CREATE TABLE users(id int)'].includes(call.sql) || call.sql.includes('INSERT INTO'))
    expect(new Set(transactionCalls.map(call => call.session))).toEqual(new Set([1]))
    expect(transactionCalls.map(call => call.sql)).toContain('BEGIN')
    expect(transactionCalls.map(call => call.sql)).toContain('COMMIT')
    expect(released).toEqual([1])
  })

  it('rolls back and releases the pinned session after a history failure', async () => {
    const calls: string[] = []
    let released = 0
    const connection = { query: async (sql: string) => {
      calls.push(sql)
      if (sql.includes('INSERT INTO')) throw new Error('history failed')
      return { rows: [] }
    } }
    const backend = new PostgresMigrationBackend({ acquire: async () => connection, release: async (value) => {
      expect(value).toBe(connection)
      released++
    } })
    await expect(backend.withLockedTransaction('deploy', async (transaction) => {
      await transaction.execute('CREATE TABLE x(id int)')
      await transaction.record(record)
    })).rejects.toThrow('history failed')
    expect(calls).toContain('ROLLBACK')
    expect(calls).not.toContain('COMMIT')
    expect(calls.at(-1)).toContain('advisory_unlock')
    expect(released).toBe(1)
  })

  it('preserves the migration failure when rollback, unlock, and release also fail', async () => {
    const migrationError = new Error('migration failed')
    const rollbackError = new Error('rollback failed')
    const unlockError = new Error('unlock failed')
    const releaseError = new Error('release failed')
    const connection = { query: async (sql: string) => {
      if (sql === 'ROLLBACK') throw rollbackError
      if (sql.includes('advisory_unlock')) throw unlockError
      return { rows: [] }
    } }
    const backend = new PostgresMigrationBackend({
      acquire: async () => connection,
      release: async () => { throw releaseError },
    })

    const failure: unknown = await backend.withLockedTransaction('deploy', async () => {
      throw migrationError
    }).then(() => undefined, error => error)

    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error('Expected an AggregateError')
    expect(failure.errors).toEqual([migrationError, rollbackError, unlockError, releaseError])
    expect(failure.cause).toBe(migrationError)
  })

  it('preserves a history read failure when releasing its session also fails', async () => {
    const readError = new Error('history read failed')
    const releaseError = new Error('release failed')
    const backend = new PostgresMigrationBackend({
      acquire: async () => ({ query: async (sql) => {
        if (sql.startsWith('SELECT id,')) throw readError
        return { rows: [] }
      } }),
      release: async () => { throw releaseError },
    })

    const failure: unknown = await backend.list().then(() => undefined, error => error)

    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error('Expected an AggregateError')
    expect(failure.errors).toEqual([readError, releaseError])
    expect(failure.cause).toBe(readError)
  })

  it('rejects when PostgreSQL reports that the advisory lock was not released', async () => {
    const backend = new PostgresMigrationBackend({
      acquire: async () => ({ query: async sql => sql.includes('advisory_unlock') ? { rows: [{ unlocked: false }] } : { rows: [] } }),
      release: async () => {},
    })

    await expect(backend.withLockedTransaction('deploy', async () => 'committed')).rejects.toThrow('was not held')
  })

  it('only drops validated owned schemas and uses CASCADE', async () => {
    const calls: string[] = []
    const connection = { query: async (sql: string) => {
      calls.push(sql)
      return { rows: [] }
    } }
    const provider = { acquire: async () => connection, release: async () => {} }

    const unscoped = new PostgresMigrationBackend(provider)
    await expect(unscoped.withLockedTransaction('fresh', transaction => transaction.dropOwned({ owner: 'app', objects: [{ kind: 'schema', name: 'app_data' }] }))).rejects.toThrow('ownershipPrefix')
    expect(calls.some(sql => sql.startsWith('DROP SCHEMA'))).toBe(false)

    calls.length = 0
    const scoped = new PostgresMigrationBackend(provider, { ownershipPrefix: 'test_' })
    await expect(scoped.withLockedTransaction('fresh', transaction => transaction.dropOwned({ owner: 'app', objects: [{ kind: 'schema', name: 'other_data' }] }))).rejects.toThrow('outside the configured ownership prefix')
    expect(calls.some(sql => sql.startsWith('DROP SCHEMA'))).toBe(false)

    calls.length = 0
    await scoped.withLockedTransaction('fresh', transaction => transaction.dropOwned({ owner: 'app', objects: [{ kind: 'schema', name: 'test_data' }] }))
    expect(calls).toContain('DROP SCHEMA IF EXISTS "test_data" CASCADE')
  })
})

describe('SQLiteMigrationBackend', () => {
  it('uses immediate callback-local transaction units safely for concurrent calls', async () => {
    const calls: Array<{ client: string, sql: string }> = []
    let transactionId = 0
    let entered = 0
    let release!: () => void
    const bothEntered = new Promise<void>((resolve) => {
      release = resolve
    })
    const root = { run: async (sql: string) => {
      calls.push({ client: 'root', sql })
    },
    all: async () => [] as Record<string, unknown>[],
    transaction: async <T>(callback: (client: SQLiteMigrationTransactionClient) => Promise<T>, options?: { behavior?: 'immediate' }) => {
      expect(options?.behavior).toBe('immediate')
      const client = `tx${++transactionId}`
      entered++
      if (entered === 2) release()
      await bothEntered
      return callback({ run: async (sql: string) => {
        calls.push({ client, sql })
      },
      all: async () => [] })
    },
    }
    const backend = new SQLiteMigrationBackend(root)
    await Promise.all([
      backend.withLockedTransaction('one', transaction => transaction.execute('statement one')),
      backend.withLockedTransaction('two', transaction => transaction.execute('statement two')),
    ])
    expect(calls.find(call => call.sql === 'statement one')?.client).toBe('tx1')
    expect(calls.find(call => call.sql === 'statement two')?.client).toBe('tx2')
    expect(calls.filter(call => call.sql.includes('migration_locks') && call.client.startsWith('tx'))).toHaveLength(4)
  })

  it('maps history rows and constrains fresh drops to the test namespace', async () => {
    const calls: string[] = []
    const ns = createTestNamespace('orders', 'fixed')
    const transactionClient = { run: async (sql: string) => {
      calls.push(sql)
    },
    all: async (sql: string) => sql.includes('SELECT id,') ? [{ id: record.id, namespace: record.namespace, name: record.name, checksum: record.checksum, batch: 2, applied_at: record.appliedAt }] : [] }
    const backend = new SQLiteMigrationBackend({ ...transactionClient, transaction: async callback => callback(transactionClient) }, { ownershipPrefix: ns.prefix })
    expect((await backend.list())[0]).toEqual(record)
    await backend.withLockedTransaction('fresh', transaction => transaction.dropOwned(ns.ownership(['users'])))
    expect(calls).toContain(`DROP TABLE IF EXISTS "${ns.prefix}users"`)
    await expect(backend.withLockedTransaction('bad', transaction => transaction.dropOwned({ owner: 'bad', objects: [{ kind: 'table', name: 'users' }] }))).rejects.toThrow('outside the configured ownership prefix')
  })

  it('preserves the migration failure when lock-row cleanup and rollback also fail', async () => {
    const migrationError = new Error('migration failed')
    const lockCleanupError = new Error('lock cleanup failed')
    const rollbackError = new Error('rollback failed')
    const transactionClient: SQLiteMigrationTransactionClient = {
      run: async (sql) => {
        if (sql.startsWith('DELETE FROM')) throw lockCleanupError
      },
      all: async () => [],
    }
    const backend = new SQLiteMigrationBackend({
      ...transactionClient,
      transaction: async (callback) => {
        try {
          return await callback(transactionClient)
        }
        catch {
          throw rollbackError
        }
      },
    })

    const failure: unknown = await backend.withLockedTransaction('deploy', async () => {
      throw migrationError
    }).then(() => undefined, error => error)

    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) throw new Error('Expected an AggregateError')
    expect(failure.errors).toEqual([migrationError, lockCleanupError, rollbackError])
    expect(failure.cause).toBe(migrationError)
  })
})

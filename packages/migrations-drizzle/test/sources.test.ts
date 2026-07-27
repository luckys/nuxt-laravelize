import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'
import { MigrationRunner, type MigrationSource } from '@nuxt-laravelize/migrations'
import { InMemoryMigrationBackend } from '@nuxt-laravelize/migrations/testing'
import { describe, expect, it } from 'vitest'
import { SQLiteMigrationBackend, type SQLiteMigrationTransactionClient } from '../src/sqlite.js'
import { migrationSourcesFor, postgresMigrationSources, sqliteMigrationSources } from '../src/sources.js'

const namespaces = [
  'nuxt-laravelize.audit-drizzle',
  'nuxt-laravelize.idempotency-drizzle',
  'nuxt-laravelize.reliability-drizzle',
  'nuxt-laravelize.scout-drizzle',
  'nuxt-laravelize.workflows-drizzle',
]

const expectedNames = {
  postgresql: [
    '0000_create_audit_entries',
    '0000_idempotency_postgres',
    '0000_reliability_postgres',
    '0002_reliability_append_availability_postgres',
    '0004_reliability_terminal_at_postgres',
    '0006_reliability_dead_letter_management_postgres',
    '0008_reliability_dead_letter_operations_postgres',
    '0000_create_scout_documents',
    '0000_workflows_postgres',
  ],
  sqlite: [
    '0001_create_audit_entries_sqlite',
    '0001_idempotency_sqlite',
    '0001_reliability_sqlite',
    '0003_reliability_append_availability_sqlite',
    '0005_reliability_terminal_at_sqlite',
    '0007_reliability_dead_letter_management_sqlite',
    '0009_reliability_dead_letter_operations_sqlite',
    '0001_create_scout_documents_sqlite',
    '0001_workflows_sqlite',
  ],
} as const

describe('aggregate migration sources', () => {
  it('exposes the exact explicit package source set and order for each dialect', () => {
    expect(postgresMigrationSources.map(source => source.namespace)).toEqual(namespaces)
    expect(sqliteMigrationSources.map(source => source.namespace)).toEqual(namespaces)
    expect(migrationSourcesFor('postgresql')).toBe(postgresMigrationSources)
    expect(migrationSourcesFor('sqlite')).toBe(sqliteMigrationSources)
    expect(Object.isFrozen(postgresMigrationSources)).toBe(true)
    expect(Object.isFrozen(sqliteMigrationSources)).toBe(true)
  })

  it.each(['postgresql', 'sqlite'] as const)('builds a unique full pending %s plan', async (dialect) => {
    const sources = migrationSourcesFor(dialect) as readonly MigrationSource<typeof dialect>[]
    const backend = new InMemoryMigrationBackend(dialect)
    const plan = await new MigrationRunner<typeof dialect>({ dialect, sources, backend }).plan()

    expect(plan).toHaveLength(9)
    expect(plan.every(item => item.state === 'pending')).toBe(true)
    expect(new Set(plan.map(item => item.id)).size).toBe(plan.length)
    const namesBySourceOrder = (await Promise.all(sources.map(source => source.migrations()))).flat().map(migration => migration.name)
    expect(namesBySourceOrder).toEqual(expectedNames[dialect])
    const migrationCounts = [1, 1, 5, 1, 1]
    let offset = 0
    const expectedIds = sources.flatMap((source, index) => {
      const names = expectedNames[dialect].slice(offset, offset + migrationCounts[index]!)
      offset += migrationCounts[index]!
      return names.map(name => `${source.namespace}:${name}`)
    })
    expect(plan.map(item => item.id)).toEqual(expectedIds)
  })

  it('executes every statement from every aggregate SQLite source through a single-statement client', async () => {
    const database = new DatabaseSync(':memory:')
    const executed: string[] = []
    const client: SQLiteMigrationTransactionClient = {
      run: (sql, parameters = []) => {
        executed.push(sql)
        database.prepare(sql).run(...parameters as SQLInputValue[])
      },
      all: (sql, parameters = []) => database.prepare(sql).all(...parameters as SQLInputValue[]) as Record<string, unknown>[],
    }
    const backend = new SQLiteMigrationBackend({
      ...client,
      transaction: async (callback, options) => {
        expect(options?.behavior).toBe('immediate')
        database.exec('BEGIN IMMEDIATE')
        try {
          const result = await callback(client)
          database.exec('COMMIT')
          return result
        }
        catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
      },
    })

    const result = await new MigrationRunner({ dialect: 'sqlite', sources: sqliteMigrationSources, backend }).up()

    expect(result.executed).toHaveLength(9)
    expect(result.statements).toHaveLength(31)
    expect(executed.filter(sql => !sql.includes('laravelize_migration'))).toEqual(result.statements.map(statement => statement.sql))
    const objects = database.prepare('SELECT name FROM sqlite_master WHERE type IN (\'table\', \'index\')').all().map(row => String(row.name))
    expect(objects).toEqual(expect.arrayContaining([
      'audit_entries_correlation_idx',
      'idempotency_records',
      'reliability_messages_dead_management_idx',
      'reliability_dead_letter_operations_retention_idx',
      'scout_documents_fts',
      'workflows_state_updated_idx',
    ]))
    database.close()
  })
})

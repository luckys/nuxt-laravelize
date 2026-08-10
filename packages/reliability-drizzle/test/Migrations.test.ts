import { describe, expect, it, vi } from 'vitest'
import { migrationSourceFor, postgresMigrationSource, sqliteMigrationSource } from '../src/migrations.js'
import type { MigrationDialect, MigrationSource } from '@luckys_luis/nuxt-laravelize-migrations'

const namespace = 'nuxt-laravelize.reliability-drizzle'

async function expectIncrementalMigrations<D extends MigrationDialect>(dialect: D, source: MigrationSource<D>, names: readonly string[]) {
  expect(migrationSourceFor(dialect)).toBe(source)
  const migrations = await source.migrations()
  expect(migrations.map(migration => migration.name)).toEqual(names)
  expect(migrations[0]?.dependsOn).toBeUndefined()
  expect(migrations[0]?.down).toBeUndefined()
  migrations.slice(1).forEach((migration, index) => {
    expect(migration.dependsOn).toEqual([`${namespace}:${names[index]}`])
    expect(migration.down).toBeUndefined()
  })
  const execute = vi.fn()
  await migrations.at(-1)!.up({ dialect, execute })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('reliability_dead_letter_operations'))
}

describe('reliability migration sources', () => {
  it('selects ordered, incremental PostgreSQL migrations', () => expectIncrementalMigrations('postgresql', postgresMigrationSource, ['0000_reliability_postgres', '0002_reliability_append_availability_postgres', '0004_reliability_terminal_at_postgres', '0006_reliability_dead_letter_management_postgres', '0008_reliability_dead_letter_operations_postgres', '0010_generalize_dead_letter_operations_postgres']))
  it('selects ordered, incremental SQLite migrations', () => expectIncrementalMigrations('sqlite', sqliteMigrationSource, ['0001_reliability_sqlite', '0003_reliability_append_availability_sqlite', '0005_reliability_terminal_at_sqlite', '0007_reliability_dead_letter_management_sqlite', '0009_reliability_dead_letter_operations_sqlite', '0011_generalize_dead_letter_operations_sqlite']))
})

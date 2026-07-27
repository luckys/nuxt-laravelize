import { describe, expect, it, vi } from 'vitest'
import { migrationSourceFor, postgresMigrationSource, sqliteMigrationSource } from '../src/migrations.js'
import type { MigrationDialect, MigrationSource } from '@nuxt-laravelize/migrations'

async function expectMigration<D extends MigrationDialect>(dialect: D, source: MigrationSource<D>, name: string) {
  expect(migrationSourceFor(dialect)).toBe(source)
  const migrations = await source.migrations()
  expect(migrations.map(migration => migration.name)).toEqual([name])
  expect(migrations[0]?.down).toBeUndefined()
  const execute = vi.fn()
  await migrations[0]!.up({ dialect, execute })
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('workflow'))
}

describe('workflow migration sources', () => {
  it('selects and loads the PostgreSQL migration', () => expectMigration('postgresql', postgresMigrationSource, '0000_workflows_postgres'))
  it('selects and loads the SQLite migration', () => expectMigration('sqlite', sqliteMigrationSource, '0001_workflows_sqlite'))
})

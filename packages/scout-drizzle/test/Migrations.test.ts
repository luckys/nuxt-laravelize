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
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('scout_documents'))
}

describe('scout migration sources', () => {
  it('selects and loads the PostgreSQL migration', () => expectMigration('postgresql', postgresMigrationSource, '0000_create_scout_documents'))
  it('selects and loads the SQLite migration', () => expectMigration('sqlite', sqliteMigrationSource, '0001_create_scout_documents_sqlite'))
})

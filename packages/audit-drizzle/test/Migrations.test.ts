import { readFile } from 'node:fs/promises'
import { splitSqlStatements } from '@nuxt-laravelize/migrations'
import { describe, expect, it, vi } from 'vitest'
import { migrationSourceFor, postgresMigrationSource, sqliteMigrationSource } from '../src/migrations.js'
import type { MigrationDialect, MigrationSource } from '@nuxt-laravelize/migrations'

async function expectOwnedMigrations<D extends MigrationDialect>(dialect: D, source: MigrationSource<D>, expected: ReadonlyArray<readonly [name: string, file: string]>) {
  expect(migrationSourceFor(dialect)).toBe(source)
  const migrations = await source.migrations()
  expect(migrations.map(migration => migration.name)).toEqual(expected.map(([name]) => name))
  for (const [index, [, file]] of expected.entries()) {
    expect(migrations[index]?.down).toBeUndefined()
    const execute = vi.fn()
    await migrations[index]!.up({ dialect, execute })
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    expect(execute.mock.calls).toEqual((dialect === 'sqlite' ? splitSqlStatements(sql) : [sql]).map(statement => [statement]))
  }
}

describe('audit migration sources', () => {
  it('loads the owned PostgreSQL SQL as irreversible migrations', () => expectOwnedMigrations('postgresql', postgresMigrationSource, [['0000_create_audit_entries', '0000_create_audit_entries.sql'], ['0002_add_audit_locale', '0002_add_audit_locale.sql']]))
  it('loads the owned SQLite SQL as irreversible migrations', () => expectOwnedMigrations('sqlite', sqliteMigrationSource, [['0001_create_audit_entries_sqlite', '0001_create_audit_entries_sqlite.sql'], ['0003_add_audit_locale_sqlite', '0003_add_audit_locale_sqlite.sql']]))

  it('does not discover the PostgreSQL hardening example', async () => {
    expect((await postgresMigrationSource.migrations()).map(migration => migration.name)).not.toContain('postgres-hardening.example')
  })
})

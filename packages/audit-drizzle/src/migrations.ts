import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { defineMigration, defineSource, executeSqlScript } from '@luckys_luis/nuxt-laravelize-migrations'
import type { Migration, MigrationDialect, MigrationSource } from '@luckys_luis/nuxt-laravelize-migrations'

const namespace = 'nuxt-laravelize.audit-drizzle'

async function loadMigration<D extends MigrationDialect>(dialect: D, name: string, file: string): Promise<Migration<D>> {
  const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
  return defineMigration({
    name,
    checksum: createHash('sha256').update(sql).digest('hex'),
    dialects: [dialect],
    up: context => dialect === 'sqlite' ? executeSqlScript(context, sql) : context.execute(sql),
  })
}

export const postgresMigrationSource: MigrationSource<'postgresql'> = defineSource(namespace, async () => [
  await loadMigration('postgresql', '0000_create_audit_entries', '0000_create_audit_entries.sql'),
  await loadMigration('postgresql', '0002_add_audit_locale', '0002_add_audit_locale.sql'),
])

export const sqliteMigrationSource: MigrationSource<'sqlite'> = defineSource(namespace, async () => [
  await loadMigration('sqlite', '0001_create_audit_entries_sqlite', '0001_create_audit_entries_sqlite.sql'),
  await loadMigration('sqlite', '0003_add_audit_locale_sqlite', '0003_add_audit_locale_sqlite.sql'),
])

export function migrationSourceFor(dialect: 'postgresql'): MigrationSource<'postgresql'>
export function migrationSourceFor(dialect: 'sqlite'): MigrationSource<'sqlite'>
export function migrationSourceFor(dialect: MigrationDialect): MigrationSource<'postgresql'> | MigrationSource<'sqlite'>
export function migrationSourceFor(dialect: MigrationDialect): MigrationSource<'postgresql'> | MigrationSource<'sqlite'> {
  return dialect === 'postgresql' ? postgresMigrationSource : sqliteMigrationSource
}

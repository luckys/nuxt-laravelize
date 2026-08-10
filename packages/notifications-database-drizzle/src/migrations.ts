import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { defineMigration, defineSource, executeSqlScript } from '@luckys_luis/nuxt-laravelize-migrations'
import type { Migration, MigrationDialect, MigrationSource } from '@luckys_luis/nuxt-laravelize-migrations'

const namespace = 'nuxt-laravelize.notifications-database-drizzle'

async function loadMigration<D extends MigrationDialect>(dialect: D, name: string, file: string): Promise<Migration<D>> {
  const content = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
  return defineMigration({ name, checksum: createHash('sha256').update(content).digest('hex'), dialects: [dialect], up: context => dialect === 'sqlite' ? executeSqlScript(context, content) : context.execute(content) })
}

export const postgresMigrationSource: MigrationSource<'postgresql'> = defineSource(namespace, async () => [await loadMigration('postgresql', '0000_notifications_database_postgres', '0000_notifications_database_postgres.sql')])
export const sqliteMigrationSource: MigrationSource<'sqlite'> = defineSource(namespace, async () => [await loadMigration('sqlite', '0001_notifications_database_sqlite', '0001_notifications_database_sqlite.sql')])

export function migrationSourceFor(dialect: 'postgresql'): MigrationSource<'postgresql'>
export function migrationSourceFor(dialect: 'sqlite'): MigrationSource<'sqlite'>
export function migrationSourceFor(dialect: MigrationDialect): MigrationSource<'postgresql'> | MigrationSource<'sqlite'>
export function migrationSourceFor(dialect: MigrationDialect): MigrationSource<'postgresql'> | MigrationSource<'sqlite'> {
  return dialect === 'postgresql' ? postgresMigrationSource : sqliteMigrationSource
}

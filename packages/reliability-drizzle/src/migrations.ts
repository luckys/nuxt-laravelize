import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { defineMigration, defineSource, executeSqlScript, migrationId } from '@luckys_luis/nuxt-laravelize-migrations'
import type { Migration, MigrationDialect, MigrationSource } from '@luckys_luis/nuxt-laravelize-migrations'

const namespace = 'nuxt-laravelize.reliability-drizzle'
type MigrationFile<D extends MigrationDialect> = Readonly<{ dialect: D, name: string, file: string, dependsOn?: string }>

async function loadMigration<D extends MigrationDialect>(definition: MigrationFile<D>): Promise<Migration<D>> {
  const sql = await readFile(new URL(`../migrations/${definition.file}`, import.meta.url), 'utf8')
  return defineMigration({
    name: definition.name,
    checksum: createHash('sha256').update(sql).digest('hex'),
    dialects: [definition.dialect],
    ...(definition.dependsOn ? { dependsOn: [migrationId(namespace, definition.dependsOn)] } : {}),
    up: context => definition.dialect === 'sqlite' ? executeSqlScript(context, sql) : context.execute(sql),
  })
}

const postgresFiles: readonly MigrationFile<'postgresql'>[] = [
  { dialect: 'postgresql', name: '0000_reliability_postgres', file: '0000_reliability_postgres.sql' },
  { dialect: 'postgresql', name: '0002_reliability_append_availability_postgres', file: '0002_reliability_append_availability_postgres.sql', dependsOn: '0000_reliability_postgres' },
  { dialect: 'postgresql', name: '0004_reliability_terminal_at_postgres', file: '0004_reliability_terminal_at_postgres.sql', dependsOn: '0002_reliability_append_availability_postgres' },
  { dialect: 'postgresql', name: '0006_reliability_dead_letter_management_postgres', file: '0006_reliability_dead_letter_management_postgres.sql', dependsOn: '0004_reliability_terminal_at_postgres' },
  { dialect: 'postgresql', name: '0008_reliability_dead_letter_operations_postgres', file: '0008_reliability_dead_letter_operations_postgres.sql', dependsOn: '0006_reliability_dead_letter_management_postgres' },
  { dialect: 'postgresql', name: '0010_generalize_dead_letter_operations_postgres', file: '0010_generalize_dead_letter_operations_postgres.sql', dependsOn: '0008_reliability_dead_letter_operations_postgres' },
]

const sqliteFiles: readonly MigrationFile<'sqlite'>[] = [
  { dialect: 'sqlite', name: '0001_reliability_sqlite', file: '0001_reliability_sqlite.sql' },
  { dialect: 'sqlite', name: '0003_reliability_append_availability_sqlite', file: '0003_reliability_append_availability_sqlite.sql', dependsOn: '0001_reliability_sqlite' },
  { dialect: 'sqlite', name: '0005_reliability_terminal_at_sqlite', file: '0005_reliability_terminal_at_sqlite.sql', dependsOn: '0003_reliability_append_availability_sqlite' },
  { dialect: 'sqlite', name: '0007_reliability_dead_letter_management_sqlite', file: '0007_reliability_dead_letter_management_sqlite.sql', dependsOn: '0005_reliability_terminal_at_sqlite' },
  { dialect: 'sqlite', name: '0009_reliability_dead_letter_operations_sqlite', file: '0009_reliability_dead_letter_operations_sqlite.sql', dependsOn: '0007_reliability_dead_letter_management_sqlite' },
  { dialect: 'sqlite', name: '0011_generalize_dead_letter_operations_sqlite', file: '0011_generalize_dead_letter_operations_sqlite.sql', dependsOn: '0009_reliability_dead_letter_operations_sqlite' },
]

export const postgresMigrationSource: MigrationSource<'postgresql'> = defineSource(namespace, () => Promise.all(postgresFiles.map(loadMigration)))
export const sqliteMigrationSource: MigrationSource<'sqlite'> = defineSource(namespace, () => Promise.all(sqliteFiles.map(loadMigration)))

export function migrationSourceFor(dialect: 'postgresql'): MigrationSource<'postgresql'>
export function migrationSourceFor(dialect: 'sqlite'): MigrationSource<'sqlite'>
export function migrationSourceFor(dialect: MigrationDialect): MigrationSource<'postgresql'> | MigrationSource<'sqlite'>
export function migrationSourceFor(dialect: MigrationDialect): MigrationSource<'postgresql'> | MigrationSource<'sqlite'> {
  return dialect === 'postgresql' ? postgresMigrationSource : sqliteMigrationSource
}

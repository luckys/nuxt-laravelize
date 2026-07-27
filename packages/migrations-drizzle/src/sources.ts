import { migrationSourceFor as auditMigrationSourceFor } from '@nuxt-laravelize/audit-drizzle/migrations'
import { migrationSourceFor as idempotencyMigrationSourceFor } from '@nuxt-laravelize/idempotency-drizzle/migrations'
import type { MigrationDialect, MigrationSource } from '@nuxt-laravelize/migrations'
import { migrationSourceFor as reliabilityMigrationSourceFor } from '@nuxt-laravelize/reliability-drizzle/migrations'
import { migrationSourceFor as scoutMigrationSourceFor } from '@nuxt-laravelize/scout-drizzle/migrations'
import { migrationSourceFor as workflowsMigrationSourceFor } from '@nuxt-laravelize/workflows-drizzle/migrations'

/**
 * Explicit framework package order. Adding a package migration source is an
 * intentional API change; this module never scans the filesystem or dependencies.
 */
export const postgresMigrationSources: readonly MigrationSource<'postgresql'>[] = Object.freeze([
  auditMigrationSourceFor('postgresql'),
  idempotencyMigrationSourceFor('postgresql'),
  reliabilityMigrationSourceFor('postgresql'),
  scoutMigrationSourceFor('postgresql'),
  workflowsMigrationSourceFor('postgresql'),
])

export const sqliteMigrationSources: readonly MigrationSource<'sqlite'>[] = Object.freeze([
  auditMigrationSourceFor('sqlite'),
  idempotencyMigrationSourceFor('sqlite'),
  reliabilityMigrationSourceFor('sqlite'),
  scoutMigrationSourceFor('sqlite'),
  workflowsMigrationSourceFor('sqlite'),
])

export function migrationSourcesFor(dialect: 'postgresql'): readonly MigrationSource<'postgresql'>[]
export function migrationSourcesFor(dialect: 'sqlite'): readonly MigrationSource<'sqlite'>[]
export function migrationSourcesFor(dialect: MigrationDialect): readonly MigrationSource<'postgresql'>[] | readonly MigrationSource<'sqlite'>[]
export function migrationSourcesFor(dialect: MigrationDialect): readonly MigrationSource<'postgresql'>[] | readonly MigrationSource<'sqlite'>[] {
  return dialect === 'postgresql' ? postgresMigrationSources : sqliteMigrationSources
}

export const aggregateMigrationSourcesFor = migrationSourcesFor

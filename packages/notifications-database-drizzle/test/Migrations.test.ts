import { describe, expect, it } from 'vitest'
import { migrationSourceFor } from '../src/migrations'

describe('database notification migrations', () => {
  it.each([
    ['postgresql', '0000_notifications_database_postgres'],
    ['sqlite', '0001_notifications_database_sqlite'],
  ] as const)('loads the owned %s migration with a stable checksum', async (dialect, name) => {
    const source = migrationSourceFor(dialect)
    const migrations = await source.migrations()
    expect(source.namespace).toBe('nuxt-laravelize.notifications-database-drizzle')
    expect(migrations.map(migration => migration.name)).toEqual([name])
    expect(migrations[0]!.checksum).toMatch(/^[a-f0-9]{64}$/)
  })
})

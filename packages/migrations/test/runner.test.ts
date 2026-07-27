import { describe, expect, it } from 'vitest'
import { ChecksumMismatchError, IrreversibleMigrationError, MigrationRunner, defineMigration, defineSource, discoverApplicationMigrations, migrationId } from '../src/index.js'
import { InMemoryMigrationBackend, migration } from '../src/testing.js'

describe('MigrationRunner', () => {
  it('orders explicit namespaced sources by dependencies and records one batch', async () => {
    const backend = new InMemoryMigrationBackend('postgresql')
    const runner = new MigrationRunner({ dialect: 'postgresql', sources: [
      defineSource('app', [migration('users')]),
      defineSource('billing', [migration('invoices', { dependsOn: ['app:users'] })]),
    ], backend })

    expect((await runner.plan()).map(item => item.id)).toEqual(['app:users', 'billing:invoices'])
    const result = await runner.up()

    expect(result.executed.map(item => item.id)).toEqual(['app:users', 'billing:invoices'])
    expect((await backend.list()).map(item => item.batch)).toEqual([1, 1])
    expect(backend.statements).toEqual(['up users', 'up invoices'])
  })

  it('is deterministic for independent sources and validates bad graphs before locking', async () => {
    const backend = new InMemoryMigrationBackend('sqlite')
    const runner = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('z', [migration('b'), migration('a')]), defineSource('a', [migration('x')])], backend })
    expect((await runner.plan()).map(item => item.id)).toEqual(['a:x', 'z:a', 'z:b'])

    const invalid = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('app', [migration('a', { dependsOn: ['missing:x'] })])], backend })
    await expect(invalid.up()).rejects.toThrow('Unknown migration dependency')
    expect(backend.transactionCount).toBe(0)
  })

  it('fails closed on changed and unknown applied migrations', async () => {
    const backend = new InMemoryMigrationBackend('sqlite')
    await backend.withLockedTransaction('seed', transaction => transaction.record({ id: 'app:a', namespace: 'app', name: 'a', checksum: 'old', batch: 1, appliedAt: new Date(0).toISOString() }))
    const runner = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('app', [migration('a')])], backend })
    await expect(runner.status()).rejects.toBeInstanceOf(ChecksumMismatchError)
    expect(backend.statements).toEqual([])

    await backend.withLockedTransaction('seed', async (transaction) => {
      await transaction.remove('app:a')
      await transaction.record({ id: 'gone:x', namespace: 'gone', name: 'x', checksum: 'x', batch: 1, appliedAt: new Date(0).toISOString() })
    })
    await expect(runner.up()).rejects.toThrow('not present in configured sources')
  })

  it('refuses an entire irreversible rollback and reverses the latest batch', async () => {
    const backend = new InMemoryMigrationBackend('postgresql')
    const irreversible = migration('b', { down: undefined })
    const runner = new MigrationRunner({ dialect: 'postgresql', sources: [defineSource('app', [migration('a'), irreversible])], backend })
    await runner.up()
    await expect(runner.rollback()).rejects.toBeInstanceOf(IrreversibleMigrationError)
    expect(backend.statements).toEqual(['up a', 'up b'])

    const reversible = new MigrationRunner({ dialect: 'postgresql', sources: [defineSource('app', [migration('a'), migration('b')])], backend })
    await reversible.rollback()
    expect(backend.statements.slice(-2)).toEqual(['down b', 'down a'])
  })

  it('pretends without locks/history writes and fresh drops only an explicit manifest', async () => {
    const backend = new InMemoryMigrationBackend('sqlite')
    const runner = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('app', [migration('a')])], backend,
      ownership: { owner: 'tests', objects: [{ kind: 'table', name: 'test_users' }] } })
    const pretend = await runner.up({ pretend: true })
    expect(pretend.statements).toEqual([{ sql: 'up a' }])
    expect(backend.transactionCount).toBe(1)
    expect(await backend.list()).toEqual([])

    await runner.fresh()
    expect(backend.dropped).toEqual([{ kind: 'table', name: 'test_users' }])
    const cleanBackend = new InMemoryMigrationBackend('sqlite')
    const unsafe = new MigrationRunner({ dialect: 'sqlite', sources: [], backend: cleanBackend })
    await expect(unsafe.fresh()).rejects.toThrow('explicit non-empty ownership manifest')
  })

  it('validates identifiers, duplicate IDs, dialects, checksums and cycles', async () => {
    expect(() => migrationId('bad space', 'x')).toThrow()
    expect(() => defineMigration({ name: 'a', checksum: '', up: async () => {} })).toThrow()
    const backend = new InMemoryMigrationBackend('sqlite')
    const make = (sources: ReturnType<typeof defineSource>[]) => new MigrationRunner({ dialect: 'sqlite', sources, backend }).plan()
    await expect(make([defineSource('app', [migration('a')]), defineSource('app', [migration('a')])])).rejects.toThrow('Duplicate migration ID')
    const incompatible = defineSource('app', [migration<'postgresql'>('a', { dialects: ['postgresql'] })]) as unknown as ReturnType<typeof defineSource>
    await expect(make([incompatible])).rejects.toThrow('does not support dialect')
    await expect(make([defineSource('app', [migration('a', { dependsOn: ['app:b'] }), migration('b', { dependsOn: ['app:a'] })])])).rejects.toThrow('cycle')
  })

  it('supports limited batches, status, reset, and releases locks after failures', async () => {
    const backend = new InMemoryMigrationBackend('sqlite')
    const runner = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('app', [migration('a'), migration('b')])], backend })
    await runner.up({ limit: 1 })
    expect((await runner.status()).map(item => item.state)).toEqual(['applied', 'pending'])
    await runner.up()
    await runner.reset()
    expect(await backend.list()).toEqual([])
    expect(backend.statements.slice(-2)).toEqual(['down b', 'down a'])

    const failing = defineMigration({ name: 'failure', checksum: 'failure-v1', up: async () => {
      throw new Error('migration failed')
    }, down: async () => {} })
    const failedRunner = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('fail', [failing])], backend })
    await expect(failedRunner.up()).rejects.toThrow('migration failed')
    await expect(backend.withLockedTransaction('probe', async () => 'released')).resolves.toBe('released')
    expect(await backend.list()).toEqual([])
  })

  it('rejects applied histories that violate dependency order', async () => {
    const backend = new InMemoryMigrationBackend('postgresql')
    await backend.withLockedTransaction('seed', transaction => transaction.record({ id: 'app:b', namespace: 'app', name: 'b', checksum: 'test:b', batch: 1, appliedAt: new Date(0).toISOString() }))
    const runner = new MigrationRunner({ dialect: 'postgresql', sources: [defineSource('app', [migration('a'), migration('b', { dependsOn: ['app:a'] })])], backend })
    await expect(runner.status()).rejects.toThrow('missing applied dependency app:a')
  })

  it('recomputes rollback selection after a concurrent apply commits', async () => {
    const backend = new InMemoryMigrationBackend('sqlite')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const concurrent = defineMigration({ name: 'race', checksum: 'race-v1', up: async (context) => {
      await context.execute('up race')
      started()
      await gate
    }, down: async context => context.execute('down race') })
    const runner = new MigrationRunner({ dialect: 'sqlite', sources: [defineSource('app', [concurrent])], backend })

    const applying = runner.up()
    await entered
    const rollingBack = runner.rollback()
    release()
    await Promise.all([applying, rollingBack])

    expect(await backend.list()).toEqual([])
    expect(backend.statements).toEqual(['up race', 'down race'])
  })

  it('atomically rolls migration statements back when history persistence fails', async () => {
    const backend = new InMemoryMigrationBackend('postgresql')
    backend.failNextRecord = true
    const runner = new MigrationRunner({ dialect: 'postgresql', sources: [defineSource('app', [migration('a')])], backend })
    await expect(runner.up()).rejects.toThrow('history write failed')
    expect(backend.statements).toEqual([])
    expect(await backend.list()).toEqual([])
  })

  it('discovers only caller-supplied application paths in deterministic order', async () => {
    const imported: string[] = []
    const source = discoverApplicationMigrations({ namespace: 'app', paths: ['migrations/b.ts', 'migrations/a.ts'], importer: async (path) => {
      imported.push(path)
      return migration(path.endsWith('a.ts') ? 'a' : 'b')
    } })
    const backend = new InMemoryMigrationBackend('sqlite')
    const runner = new MigrationRunner({ dialect: 'sqlite', sources: [source], backend })
    expect((await runner.plan()).map(item => item.id)).toEqual(['app:a', 'app:b'])
    expect(imported).toEqual(['migrations/a.ts', 'migrations/b.ts'])
  })
})

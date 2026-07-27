import { defineMigration, type FreshOwnership, type Migration, type MigrationBackend, type MigrationDialect, type MigrationRecord, type MigrationTransaction } from './index.js'

export class InMemoryMigrationBackend<D extends MigrationDialect = MigrationDialect> implements MigrationBackend<D> {
  readonly records = new Map<string, MigrationRecord>()
  readonly statements: string[] = []
  readonly dropped: FreshOwnership['objects'][number][] = []
  transactionCount = 0
  failNextRecord = false
  #tail: Promise<void> = Promise.resolve()
  constructor(readonly dialect: D) {}
  async list(): Promise<readonly MigrationRecord[]> { return sorted(this.records) }
  async withLockedTransaction<T>(_name: string, callback: (transaction: MigrationTransaction<D>) => Promise<T>): Promise<T> {
    let release!: () => void
    const previous = this.#tail
    this.#tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    this.transactionCount++
    const records = new Map(this.records)
    const statements = [...this.statements]
    const dropped = [...this.dropped]
    const transaction: MigrationTransaction<D> = {
      dialect: this.dialect,
      list: async () => sorted(records),
      execute: async (sql) => { statements.push(sql) },
      record: async (record) => {
        if (this.failNextRecord) {
          this.failNextRecord = false
          throw new Error('history write failed')
        }
        if (records.has(record.id)) throw new Error(`Migration already recorded: ${record.id}`)
        records.set(record.id, Object.freeze({ ...record }))
      },
      remove: async (id) => { records.delete(id) },
      clear: async () => { records.clear() },
      dropOwned: async (ownership) => { dropped.push(...ownership.objects) },
    }
    try {
      const result = await callback(transaction)
      this.records.clear()
      for (const [id, record] of records) this.records.set(id, record)
      this.statements.splice(0, this.statements.length, ...statements)
      this.dropped.splice(0, this.dropped.length, ...dropped)
      return result
    }
    finally { release() }
  }
}
const sorted = (records: ReadonlyMap<string, MigrationRecord>): readonly MigrationRecord[] => [...records.values()].sort((a, b) => a.batch - b.batch || a.appliedAt.localeCompare(b.appliedAt) || a.id.localeCompare(b.id))
export function migration<D extends MigrationDialect = MigrationDialect>(name: string, options: { checksum?: string, dependsOn?: readonly string[], dialects?: readonly D[], down?: ((context: Parameters<NonNullable<Migration<D>['down']>>[0]) => Promise<void>) | undefined } = {}): Migration<D> {
  const hasDown = Object.prototype.hasOwnProperty.call(options, 'down')
  return defineMigration({ name, checksum: options.checksum ?? `test:${name}`, ...(options.dependsOn ? { dependsOn: options.dependsOn } : {}), ...(options.dialects ? { dialects: options.dialects } : {}), up: async context => context.execute(`up ${name}`), ...(!hasDown ? { down: async context => context.execute(`down ${name}`) } : options.down ? { down: options.down } : {}) })
}

export type MigrationDialect = 'postgresql' | 'sqlite'
export type MigrationDirection = 'up' | 'down'
export interface MigrationStatement { readonly sql: string, readonly parameters?: readonly unknown[] }
export interface MigrationContext<D extends MigrationDialect = MigrationDialect> { readonly dialect: D, execute(sql: string, parameters?: readonly unknown[]): Promise<void> }
export interface Migration<D extends MigrationDialect = MigrationDialect> {
  readonly name: string
  /** Stable reviewed content digest, normally SHA-256. */
  readonly checksum: string
  readonly dependsOn?: readonly string[]
  readonly dialects?: readonly D[]
  up(context: MigrationContext<D>): Promise<void>
  /** Omission explicitly declares an irreversible migration. */
  readonly down?: (context: MigrationContext<D>) => Promise<void>
}
export interface MigrationSource<D extends MigrationDialect = MigrationDialect> { readonly namespace: string, migrations(): readonly Migration<D>[] | Promise<readonly Migration<D>[]> }
export interface MigrationRecord { readonly id: string, readonly namespace: string, readonly name: string, readonly checksum: string, readonly batch: number, readonly appliedAt: string }
export interface MigrationHistoryReader { list(): Promise<readonly MigrationRecord[]> }
export interface MigrationHistory extends MigrationHistoryReader { record(record: MigrationRecord): Promise<void>, remove(id: string): Promise<void>, clear(): Promise<void> }
export interface MigrationExecutor<D extends MigrationDialect = MigrationDialect> { readonly dialect: D, execute(sql: string, parameters?: readonly unknown[]): Promise<void> }
export type OwnedDatabaseObject = Readonly<{ kind: 'table' | 'schema', name: string }>
export interface FreshOwnership { readonly owner: string, readonly objects: readonly OwnedDatabaseObject[] }
export interface MigrationTransaction<D extends MigrationDialect = MigrationDialect> extends MigrationHistory, MigrationExecutor<D> {
  /** Must drop exactly this allowlist and never infer ownership. */
  dropOwned(ownership: FreshOwnership): Promise<void>
}
export interface MigrationLock<D extends MigrationDialect = MigrationDialect> {
  /** Callback receives the transaction-bound history/executor. Commit occurs only after it returns. */
  withLockedTransaction<T>(name: string, callback: (transaction: MigrationTransaction<D>) => Promise<T>): Promise<T>
}
export interface MigrationBackend<D extends MigrationDialect = MigrationDialect> extends MigrationHistoryReader, MigrationLock<D> { readonly dialect: D }

export class MigrationConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationConfigurationError'
  }
}
export class ChecksumMismatchError extends Error {
  constructor(id: string) {
    super(`Checksum mismatch for applied migration ${id}`)
    this.name = 'ChecksumMismatchError'
  }
}
export class IrreversibleMigrationError extends Error {
  constructor(ids: readonly string[]) {
    super(`Rollback refused because migrations are irreversible: ${ids.join(', ')}`)
    this.name = 'IrreversibleMigrationError'
  }
}

const PART = /^[a-z0-9][\w.-]{0,127}$/i
const CHECKSUM = /^[\x21-\x7E]{1,256}$/
const assertPart = (value: string, label: string): void => {
  if (!PART.test(value)) throw new MigrationConfigurationError(`${label} must match ${PART}`)
}
const isMigrationId = (value: string): boolean => {
  const split = value.split(':')
  return split.length === 2 && PART.test(split[0]!) && PART.test(split[1]!)
}
export function migrationId(namespace: string, name: string): string {
  assertPart(namespace, 'Migration namespace')
  assertPart(name, 'Migration name')
  return `${namespace}:${name}`
}
export function defineMigration<D extends MigrationDialect>(migration: Migration<D>): Migration<D> {
  assertPart(migration.name, 'Migration name')
  if (!CHECKSUM.test(migration.checksum)) throw new MigrationConfigurationError('Migration checksum must be a non-empty printable value of at most 256 characters')
  if (typeof migration.up !== 'function' || (migration.down !== undefined && typeof migration.down !== 'function')) throw new MigrationConfigurationError('Migration up/down handlers must be functions')
  if (migration.dependsOn?.some(id => !isMigrationId(id))) throw new MigrationConfigurationError(`Migration ${migration.name} has an invalid dependency ID`)
  if (migration.dialects && (!migration.dialects.length || migration.dialects.some(d => d !== 'postgresql' && d !== 'sqlite'))) throw new MigrationConfigurationError(`Migration ${migration.name} has invalid dialects`)
  return Object.freeze({ ...migration, ...(migration.dependsOn ? { dependsOn: Object.freeze([...migration.dependsOn]) } : {}), ...(migration.dialects ? { dialects: Object.freeze([...migration.dialects]) } : {}) })
}
export function defineSource<D extends MigrationDialect>(namespace: string, migrations: readonly Migration<D>[] | (() => readonly Migration<D>[] | Promise<readonly Migration<D>[]>)): MigrationSource<D> {
  assertPart(namespace, 'Migration namespace')
  return Object.freeze({ namespace, migrations: typeof migrations === 'function' ? migrations : () => migrations })
}
export const combineMigrationSources = <D extends MigrationDialect>(...sources: readonly MigrationSource<D>[]): readonly MigrationSource<D>[] => Object.freeze(sources.flat())

type SqlScriptState = 'normal' | 'single-quote' | 'double-quote' | 'backtick' | 'bracket' | 'line-comment' | 'block-comment'

/** Split a SQLite-style SQL script into statements suitable for prepared clients. */
export function splitSqlStatements(script: string): readonly string[] {
  const statements: string[] = []
  let state: SqlScriptState = 'normal'
  let start = 0
  let hasCode = false
  let leadingWords: string[] = []
  let createTrigger = false
  let triggerBodyStarted = false
  let triggerBodyEnded = false
  let triggerCaseDepth = 0

  const resetStatement = (): void => {
    leadingWords = []
    createTrigger = false
    triggerBodyStarted = false
    triggerBodyEnded = false
    triggerCaseDepth = 0
  }

  for (let index = 0; index < script.length; index++) {
    const character = script[index]!
    const next = script[index + 1]

    if (state === 'line-comment') {
      if (character === '\n') state = 'normal'
      continue
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        state = 'normal'
        index++
      }
      continue
    }
    if (state === 'bracket') {
      if (character === ']' && next === ']') index++
      else if (character === ']') state = 'normal'
      continue
    }
    if (state !== 'normal') {
      const delimiter = state === 'single-quote' ? '\'' : state === 'double-quote' ? '"' : '`'
      if (character === delimiter && next === delimiter) index++
      else if (character === delimiter) state = 'normal'
      continue
    }

    if (/[A-Za-z_]/u.test(character)) {
      let end = index + 1
      while (end < script.length && /[\p{L}\p{N}\p{M}_$]/u.test(script[end]!)) end++
      const word = script.slice(index, end).toUpperCase()
      if (leadingWords.length < 3) leadingWords.push(word)
      createTrigger ||= leadingWords[0] === 'CREATE' && (leadingWords[1] === 'TRIGGER' || ((leadingWords[1] === 'TEMP' || leadingWords[1] === 'TEMPORARY') && leadingWords[2] === 'TRIGGER'))
      if (createTrigger) {
        if (!triggerBodyStarted && word === 'BEGIN') triggerBodyStarted = true
        else if (triggerBodyStarted && word === 'CASE') triggerCaseDepth++
        else if (triggerBodyStarted && word === 'END') {
          if (triggerCaseDepth > 0) triggerCaseDepth--
          else triggerBodyEnded = true
        }
      }
      hasCode = true
      index = end - 1
    }
    else if (character === '-' && next === '-') {
      state = 'line-comment'
      index++
    }
    else if (character === '/' && next === '*') {
      state = 'block-comment'
      index++
    }
    else if (character === '\'') {
      state = 'single-quote'
      hasCode = true
    }
    else if (character === '"') {
      state = 'double-quote'
      hasCode = true
    }
    else if (character === '`') {
      state = 'backtick'
      hasCode = true
    }
    else if (character === '[') {
      state = 'bracket'
      hasCode = true
    }
    else if (character === ';') {
      if (createTrigger && (!triggerBodyStarted || !triggerBodyEnded)) {
        if (!triggerBodyStarted) throw new TypeError('SQL script contains an unsupported malformed CREATE TRIGGER compound body')
        continue
      }
      if (hasCode) statements.push(script.slice(start, index + 1).trim())
      start = index + 1
      hasCode = false
      resetStatement()
    }
    else if (!/\s/u.test(character)) {
      hasCode = true
    }
  }

  if (state !== 'normal' && state !== 'line-comment') throw new TypeError(`SQL script contains an unterminated ${state.replaceAll('-', ' ')}`)
  if (createTrigger) throw new TypeError('SQL script contains an unterminated CREATE TRIGGER compound body')
  if (hasCode) statements.push(script.slice(start).trim())
  return Object.freeze(statements)
}

export async function executeSqlScript<D extends MigrationDialect>(context: MigrationContext<D>, script: string): Promise<void> {
  for (const statement of splitSqlStatements(script)) await context.execute(statement)
}

export interface ApplicationMigrationDiscovery<D extends MigrationDialect> {
  readonly namespace: string
  /** Explicit paths or caller-provided glob results. They are sorted before import. */
  readonly paths: readonly string[]
  readonly importer: (path: string) => Migration<D> | readonly Migration<D>[] | Promise<Migration<D> | readonly Migration<D>[]>
}
/** Narrow application discovery only; no filesystem or package scanning is performed. */
export function discoverApplicationMigrations<D extends MigrationDialect>(options: ApplicationMigrationDiscovery<D>): MigrationSource<D> {
  const paths = [...options.paths]
  if (paths.some(path => typeof path !== 'string' || !path.trim())) throw new MigrationConfigurationError('Application migration paths must be non-empty strings')
  if (new Set(paths).size !== paths.length) throw new MigrationConfigurationError('Application migration paths must be unique')
  paths.sort((a, b) => a.localeCompare(b))
  return defineSource(options.namespace, async () => {
    const migrations: Migration<D>[] = []
    for (const path of paths) {
      const imported = await options.importer(path)
      migrations.push(...(Array.isArray(imported) ? imported : [imported as Migration<D>]))
    }
    return migrations
  })
}

type LoadedMigration<D extends MigrationDialect> = Readonly<{ id: string, namespace: string, migration: Migration<D> }>
export type MigrationStatus = Readonly<{ id: string, namespace: string, name: string, checksum: string, state: 'pending' | 'applied', batch?: number, appliedAt?: string }>
export type MigrationPlan = MigrationStatus
export type MigrationRunResult = Readonly<{ executed: readonly Readonly<{ id: string, direction: MigrationDirection, batch?: number }>[], statements: readonly MigrationStatement[] }>
export interface MigrationRunnerOptions<D extends MigrationDialect> { readonly dialect: D, readonly sources: readonly MigrationSource<D>[], readonly backend: MigrationBackend<D>, readonly ownership?: FreshOwnership, readonly lockName?: string, readonly clock?: () => Date }

export class MigrationRunner<D extends MigrationDialect> {
  constructor(private readonly options: MigrationRunnerOptions<D>) {
    if (options.backend.dialect !== options.dialect) throw new MigrationConfigurationError(`Backend dialect ${options.backend.dialect} does not match selected dialect ${options.dialect}`)
    assertPart(options.lockName ?? 'migrations', 'Migration lock name')
  }

  async plan(): Promise<readonly MigrationPlan[]> {
    const loaded = await this.load()
    return this.toStatus(loaded, await this.checkedRecords(loaded, this.options.backend))
  }

  status(): Promise<readonly MigrationStatus[]> { return this.plan() }

  up(options: { pretend?: boolean, limit?: number } = {}): Promise<MigrationRunResult> {
    if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) throw new MigrationConfigurationError('up limit must be a positive safe integer')
    return this.locked(async (loaded, transaction, records) => {
      const applied = new Set(records.map(record => record.id))
      const pending = loaded.filter(item => !applied.has(item.id)).slice(0, options.limit)
      const batch = records.reduce((maximum, record) => Math.max(maximum, record.batch), 0) + 1
      return this.execute(pending, 'up', batch, transaction, options.pretend ?? false)
    })
  }

  rollback(options: { pretend?: boolean, batches?: number } = {}): Promise<MigrationRunResult> {
    const count = options.batches ?? 1
    if (!Number.isSafeInteger(count) || count < 1) throw new MigrationConfigurationError('rollback batches must be a positive safe integer')
    return this.locked(async (loaded, transaction, records) => {
      const batches = [...new Set(records.map(record => record.batch))].sort((a, b) => b - a).slice(0, count)
      const selectedIds = new Set(records.filter(record => batches.includes(record.batch)).map(record => record.id))
      const selected = loaded.filter(item => selectedIds.has(item.id)).reverse()
      this.assertReversible(selected)
      return this.execute(selected, 'down', undefined, transaction, options.pretend ?? false)
    })
  }

  reset(options: { pretend?: boolean } = {}): Promise<MigrationRunResult> {
    return this.locked(async (loaded, transaction, records) => {
      const selectedIds = new Set(records.map(record => record.id))
      const selected = loaded.filter(item => selectedIds.has(item.id)).reverse()
      this.assertReversible(selected)
      return this.execute(selected, 'down', undefined, transaction, options.pretend ?? false)
    })
  }

  fresh(options: { pretend?: boolean } = {}): Promise<MigrationRunResult> {
    return this.locked(async (loaded, transaction) => {
      const ownership = this.options.ownership
      if (!ownership || !PART.test(ownership.owner) || !ownership.objects.length) throw new MigrationConfigurationError('fresh requires an explicit non-empty ownership manifest')
      validateOwnership(ownership)
      if (options.pretend) {
        const result = await this.execute(loaded, 'up', 1, transaction, true)
        return { executed: result.executed, statements: [...ownership.objects.map(object => ({ sql: `fresh ${object.kind} ${object.name}` })), ...result.statements] }
      }
      await transaction.dropOwned(ownership)
      await transaction.clear()
      return this.execute(loaded, 'up', 1, transaction, false)
    })
  }

  private async locked(run: (loaded: readonly LoadedMigration<D>[], transaction: MigrationTransaction<D>, records: readonly MigrationRecord[]) => Promise<MigrationRunResult>): Promise<MigrationRunResult> {
    const loaded = await this.load()
    return this.options.backend.withLockedTransaction(this.options.lockName ?? 'migrations', async transaction => run(loaded, transaction, await this.checkedRecords(loaded, transaction)))
  }

  private async execute(selected: readonly LoadedMigration<D>[], direction: MigrationDirection, batch: number | undefined, transaction: MigrationTransaction<D>, pretend: boolean): Promise<MigrationRunResult> {
    const statements: MigrationStatement[] = []
    const executed: Array<{ id: string, direction: MigrationDirection, batch?: number }> = []
    for (const item of selected) {
      const context: MigrationContext<D> = { dialect: this.options.dialect, execute: async (sql, parameters) => {
        if (!sql.trim()) throw new MigrationConfigurationError(`Migration ${item.id} produced empty SQL`)
        statements.push({ sql, ...(parameters ? { parameters } : {}) })
        if (!pretend) await transaction.execute(sql, parameters)
      } }
      if (direction === 'up') await item.migration.up(context)
      else await item.migration.down!(context)
      if (!pretend) {
        if (direction === 'up') await transaction.record({ id: item.id, namespace: item.namespace, name: item.migration.name, checksum: item.migration.checksum, batch: batch!, appliedAt: (this.options.clock ?? (() => new Date()))().toISOString() })
        else await transaction.remove(item.id)
      }
      executed.push({ id: item.id, direction, ...(batch !== undefined ? { batch } : {}) })
    }
    return { executed, statements }
  }

  private assertReversible(items: readonly LoadedMigration<D>[]): void {
    const ids = items.filter(item => !item.migration.down).map(item => item.id)
    if (ids.length) throw new IrreversibleMigrationError(ids)
  }

  private toStatus(loaded: readonly LoadedMigration<D>[], records: readonly MigrationRecord[]): readonly MigrationStatus[] {
    const byId = new Map(records.map(record => [record.id, record]))
    return loaded.map(({ id, namespace, migration }) => {
      const applied = byId.get(id)
      return { id, namespace, name: migration.name, checksum: migration.checksum, state: applied ? 'applied' : 'pending', ...(applied ? { batch: applied.batch, appliedAt: applied.appliedAt } : {}) }
    })
  }

  private async checkedRecords(loaded: readonly LoadedMigration<D>[], history: MigrationHistoryReader): Promise<readonly MigrationRecord[]> {
    const records = await history.list()
    const known = new Map(loaded.map(item => [item.id, item]))
    const seen = new Set<string>()
    for (const record of records) {
      if (seen.has(record.id)) throw new MigrationConfigurationError(`Duplicate applied migration record ${record.id}`)
      seen.add(record.id)
      const item = known.get(record.id)
      if (!item) throw new MigrationConfigurationError(`Applied migration ${record.id} is not present in configured sources`)
      if (record.namespace !== item.namespace || record.name !== item.migration.name || record.id !== migrationId(record.namespace, record.name)) throw new MigrationConfigurationError(`Applied migration identity is inconsistent: ${record.id}`)
      if (record.checksum !== item.migration.checksum) throw new ChecksumMismatchError(record.id)
      if (!Number.isSafeInteger(record.batch) || record.batch < 1 || !isCanonicalDate(record.appliedAt)) throw new MigrationConfigurationError(`Applied migration record is invalid: ${record.id}`)
    }
    const byId = new Map(records.map(record => [record.id, record]))
    for (const record of records) for (const dependency of known.get(record.id)!.migration.dependsOn ?? []) {
      const dependencyRecord = byId.get(dependency)
      if (!dependencyRecord) throw new MigrationConfigurationError(`Applied migration ${record.id} is missing applied dependency ${dependency}`)
      if (dependencyRecord.batch > record.batch) throw new MigrationConfigurationError(`Applied migration ${record.id} precedes dependency ${dependency}`)
    }
    return records
  }

  private async load(): Promise<readonly LoadedMigration<D>[]> {
    const all: LoadedMigration<D>[] = []
    const seen = new Set<string>()
    for (const source of this.options.sources) {
      assertPart(source.namespace, 'Migration namespace')
      for (const raw of await source.migrations()) {
        const migration = defineMigration(raw)
        const id = migrationId(source.namespace, migration.name)
        if (seen.has(id)) throw new MigrationConfigurationError(`Duplicate migration ID ${id}`)
        seen.add(id)
        if (migration.dialects && !migration.dialects.includes(this.options.dialect)) throw new MigrationConfigurationError(`Migration ${id} does not support dialect ${this.options.dialect}`)
        all.push({ id, namespace: source.namespace, migration })
      }
    }
    return topologicalSort(all)
  }
}

const isCanonicalDate = (value: string): boolean => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}
const validateOwnership = (ownership: FreshOwnership): void => {
  const seen = new Set<string>()
  for (const object of ownership.objects) {
    assertPart(object.name, 'Owned database object name')
    const key = `${object.kind}:${object.name}`
    if (seen.has(key)) throw new MigrationConfigurationError(`Duplicate owned database object ${key}`)
    seen.add(key)
  }
}
const topologicalSort = <D extends MigrationDialect>(items: readonly LoadedMigration<D>[]): readonly LoadedMigration<D>[] => {
  const byId = new Map(items.map(item => [item.id, item]))
  const incoming = new Map(items.map(item => [item.id, 0]))
  const outgoing = new Map(items.map(item => [item.id, [] as string[]]))
  for (const item of items) for (const dependency of item.migration.dependsOn ?? []) {
    if (!byId.has(dependency)) throw new MigrationConfigurationError(`Unknown migration dependency ${dependency} required by ${item.id}`)
    incoming.set(item.id, incoming.get(item.id)! + 1)
    outgoing.get(dependency)!.push(item.id)
  }
  const ready = items.filter(item => incoming.get(item.id) === 0).sort((a, b) => a.id.localeCompare(b.id))
  const sorted: LoadedMigration<D>[] = []
  while (ready.length) {
    const item = ready.shift()!
    sorted.push(item)
    for (const id of outgoing.get(item.id)!.sort()) {
      incoming.set(id, incoming.get(id)! - 1)
      if (incoming.get(id) === 0) {
        ready.push(byId.get(id)!)
        ready.sort((a, b) => a.id.localeCompare(b.id))
      }
    }
  }
  if (sorted.length !== items.length) throw new MigrationConfigurationError('Migration dependency cycle detected')
  return sorted
}

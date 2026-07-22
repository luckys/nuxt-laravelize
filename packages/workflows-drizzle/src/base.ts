import { sql, type SQL } from 'drizzle-orm'
import { canonicalize, LeaseConflictError, RevisionConflictError, StartKeyConflictError, type JsonValue, type RecoverableWorkflowStore, type StepSnapshot, type WorkflowRecoveryPage, type WorkflowRecoveryQuery, type WorkflowSnapshot, type WorkflowState } from '@nuxt-laravelize/workflows'

type Row = Record<string, unknown>
export type WorkflowQueryExecutor = (query: SQL) => Row[] | PromiseLike<Row[]>

export const postgresRows = (result: unknown): Row[] => {
  if (result && typeof result === 'object' && !Array.isArray(result) && Array.isArray((result as { rows?: unknown }).rows))
    return (result as { rows: Row[] }).rows
  if (!Array.isArray(result)) return []
  if (Array.isArray(result[0])) return result[0] as Row[]
  return result as Row[]
}

const safeInteger = (value: unknown, name: string): number => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number)) throw new TypeError(`${name} must be a safe integer`)
  return number
}

const epoch = (value: unknown, name: string): number => {
  return safeInteger(value, name)
}

const assertJsonSafe = (value: unknown, seen = new WeakSet<object>()): void => {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new TypeError('Workflow snapshot contains values that are not JSON safe')
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Workflow snapshot contains values that are not JSON safe')
  if (value && typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Workflow snapshot must be JSON serializable')
    seen.add(value)
    if (Array.isArray(value)) value.forEach(item => assertJsonSafe(item, seen))
    else {
      if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Workflow snapshot must contain only arrays and plain objects')
      Object.values(value).forEach(item => assertJsonSafe(item, seen))
    }
    seen.delete(value)
  }
}

const assertSnapshot = (snapshot: WorkflowSnapshot): void => {
  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.id !== 'string' || !snapshot.id || typeof snapshot.workflowName !== 'string' || typeof snapshot.workflowVersion !== 'string' || typeof snapshot.startKey !== 'string' || typeof snapshot.canonicalInput !== 'string')
    throw new TypeError('Invalid workflow snapshot identity')
  if (!Array.isArray(snapshot.steps) || typeof snapshot.cancellationRequested !== 'boolean') throw new TypeError('Invalid workflow snapshot')
  if (safeInteger(snapshot.revision, 'revision') < 0) throw new TypeError('revision must be non-negative')
  epoch(snapshot.createdAt, 'createdAt')
  epoch(snapshot.updatedAt, 'updatedAt')
  if (snapshot.lease) epoch(snapshot.lease.expiresAt, 'lease.expiresAt')
  for (const step of snapshot.steps) {
    if (safeInteger(step.attempts, `steps.${step.name}.attempts`) < 0 || safeInteger(step.compensationAttempts, `steps.${step.name}.compensationAttempts`) < 0) throw new TypeError('Workflow attempts must be non-negative')
    if (step.retryAt !== undefined) epoch(step.retryAt, `steps.${step.name}.retryAt`)
  }
  assertJsonSafe(snapshot)
  if (canonicalize(snapshot.input) !== snapshot.canonicalInput) throw new TypeError('canonicalInput must match workflow input')
}

const serialize = (snapshot: WorkflowSnapshot): string => {
  assertSnapshot(snapshot)
  let json: string | undefined
  try {
    json = JSON.stringify(snapshot)
  }
  catch { throw new TypeError('Workflow snapshot must be JSON serializable') }
  if (json === undefined) throw new TypeError('Workflow snapshot must be JSON serializable')
  return json
}

const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string') throw new TypeError(`Invalid persisted workflow ${name}`)
  return value
}

const boolean = (value: unknown): boolean => value === true || value === 1 || value === '1' || value === 'true'

const hydrate = (row: Row): WorkflowSnapshot => {
  let body: unknown
  try {
    body = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot
  }
  catch { throw new TypeError('Invalid persisted workflow snapshot JSON') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Invalid persisted workflow snapshot')
  const persisted = body as Partial<WorkflowSnapshot>
  const leaseToken = row.lease_token == null ? undefined : text(row.lease_token, 'lease token')
  const leaseExpiresAt = row.lease_expires_at == null ? undefined : epoch(row.lease_expires_at, 'leaseExpiresAt')
  if ((leaseToken === undefined) !== (leaseExpiresAt === undefined)) throw new TypeError('Invalid persisted workflow lease')
  const result: WorkflowSnapshot = {
    ...persisted,
    id: text(row.id, 'id'),
    workflowName: text(row.workflow_name, 'name'),
    workflowVersion: text(row.workflow_version, 'version'),
    startKey: text(row.start_key, 'start key'),
    canonicalInput: text(row.canonical_input, 'canonical input'),
    input: persisted.input as JsonValue,
    state: text(row.state, 'state') as WorkflowState,
    revision: safeInteger(row.revision, 'revision'),
    steps: persisted.steps as StepSnapshot[],
    cancellationRequested: boolean(row.cancellation_requested),
    createdAt: epoch(row.created_at, 'createdAt'),
    updatedAt: epoch(row.updated_at, 'updatedAt'),
    ...(leaseToken === undefined ? { lease: undefined } : { lease: { token: leaseToken, expiresAt: leaseExpiresAt! } }),
  }
  if (result.lease === undefined) delete result.lease
  assertSnapshot(result)
  return result
}

export abstract class DrizzleWorkflowStore implements RecoverableWorkflowStore {
  readonly durability = 'durable' as const
  protected constructor(private readonly executeRows: WorkflowQueryExecutor) {}

  async create(snapshot: WorkflowSnapshot): Promise<{ snapshot: WorkflowSnapshot, created: boolean }> {
    const payload = serialize(snapshot)
    const inserted = (await this.executeRows(sql`insert into workflows (id, workflow_name, workflow_version, start_key, canonical_input, snapshot, state, revision, cancellation_requested, lease_token, lease_expires_at, created_at, updated_at) values (${snapshot.id}, ${snapshot.workflowName}, ${snapshot.workflowVersion}, ${snapshot.startKey}, ${snapshot.canonicalInput}, ${payload}, ${snapshot.state}, ${snapshot.revision}, ${snapshot.cancellationRequested}, ${snapshot.lease?.token ?? null}, ${snapshot.lease?.expiresAt ?? null}, ${snapshot.createdAt}, ${snapshot.updatedAt}) on conflict do nothing returning *`))[0]
    if (inserted) return { snapshot: hydrate(inserted), created: true }
    const candidates = await this.executeRows(sql`select * from workflows where id = ${snapshot.id} or (workflow_name = ${snapshot.workflowName} and workflow_version = ${snapshot.workflowVersion} and start_key = ${snapshot.startKey})`)
    const existing = candidates.find(row => row.workflow_name === snapshot.workflowName && row.workflow_version === snapshot.workflowVersion && row.start_key === snapshot.startKey)
    if (!existing || existing.canonical_input !== snapshot.canonicalInput) throw new StartKeyConflictError()
    return { snapshot: hydrate(existing), created: false }
  }

  async get(id: string): Promise<WorkflowSnapshot | null> {
    const row = (await this.executeRows(sql`select * from workflows where id = ${id} limit ${1}`))[0]
    return row ? hydrate(row) : null
  }

  async discoverRecoverable(query: WorkflowRecoveryQuery): Promise<WorkflowRecoveryPage> {
    const limit = query.limit ?? 100
    if (!Number.isSafeInteger(query.updatedBefore)) throw new TypeError('updatedBefore must be a safe integer')
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('limit must be an integer between 1 and 1000')
    if (query.cursor && (!Number.isSafeInteger(query.cursor.updatedAt) || !query.cursor.id)) throw new TypeError('Invalid workflow recovery cursor')
    const active = sql`state <> ${'completed'} and state <> ${'failed'} and state <> ${'compensated'} and state <> ${'compensation_failed'} and state <> ${'cancelled'}`
    const rows = query.cursor
      ? await this.executeRows(sql`select id, updated_at from workflows where ${active} and updated_at <= ${query.updatedBefore} and (updated_at > ${query.cursor.updatedAt} or (updated_at = ${query.cursor.updatedAt} and id > ${query.cursor.id})) order by updated_at asc, id asc limit ${limit}`)
      : await this.executeRows(sql`select id, updated_at from workflows where ${active} and updated_at <= ${query.updatedBefore} order by updated_at asc, id asc limit ${limit}`)
    const workflowIds = rows.map(row => text(row.id, 'id'))
    const last = rows.at(-1)
    return {
      workflowIds,
      ...(rows.length === limit && last ? { nextCursor: { updatedAt: epoch(last.updated_at, 'updatedAt'), id: text(last.id, 'id') } } : {}),
    }
  }

  async claim(id: string, expectedRevision: number, token: string, now: number, expiresAt: number): Promise<WorkflowSnapshot> {
    safeInteger(expectedRevision, 'expectedRevision')
    epoch(now, 'now')
    epoch(expiresAt, 'expiresAt')
    if (expiresAt <= now) throw new TypeError('expiresAt must be greater than now')
    const claimed = (await this.executeRows(sql`update workflows set revision = revision + ${1}, lease_token = ${token}, lease_expires_at = ${expiresAt}, updated_at = ${now} where id = ${id} and revision = ${expectedRevision} and (lease_token is null or lease_expires_at <= ${now}) returning *`))[0]
    if (claimed) return hydrate(claimed)
    const current = await this.requiredRow(id)
    if (safeInteger(current.revision, 'revision') !== expectedRevision) throw new RevisionConflictError()
    throw new LeaseConflictError()
  }

  async renewLease(id: string, expectedRevision: number, token: string, now: number, expiresAt: number): Promise<WorkflowSnapshot> {
    safeInteger(expectedRevision, 'expectedRevision')
    epoch(now, 'now')
    epoch(expiresAt, 'expiresAt')
    if (expiresAt <= now) throw new TypeError('expiresAt must be greater than now')
    const renewed = (await this.executeRows(sql`update workflows set lease_expires_at = ${expiresAt} where id = ${id} and lease_token = ${token} and lease_expires_at > ${now} and (revision = ${expectedRevision} or (revision = ${expectedRevision + 1} and cancellation_requested = ${true})) returning *`))[0]
    if (renewed) return hydrate(renewed)
    const current = await this.requiredRow(id)
    if (current.lease_token !== token || current.lease_expires_at == null || epoch(current.lease_expires_at, 'leaseExpiresAt') <= now) throw new LeaseConflictError()
    throw new RevisionConflictError()
  }

  async commit(snapshot: WorkflowSnapshot, expectedRevision: number, leaseToken: string, now: number, releaseLease = true): Promise<WorkflowSnapshot> {
    const payload = serialize(snapshot)
    safeInteger(expectedRevision, 'expectedRevision')
    epoch(now, 'now')
    const committed = (await this.executeRows(sql`update workflows set snapshot = ${payload}, state = ${snapshot.state}, revision = revision + ${1}, cancellation_requested = case when cancellation_requested = ${true} or ${snapshot.cancellationRequested} = ${true} then ${true} else ${false} end, lease_token = case when ${releaseLease} = ${true} then null else lease_token end, lease_expires_at = case when ${releaseLease} = ${true} then null else lease_expires_at end, updated_at = ${snapshot.updatedAt} where id = ${snapshot.id} and canonical_input = ${snapshot.canonicalInput} and lease_token = ${leaseToken} and lease_expires_at > ${now} and (revision = ${expectedRevision} or (revision = ${expectedRevision + 1} and cancellation_requested = ${true} and ${snapshot.cancellationRequested} = ${false})) returning *`))[0]
    if (committed) return hydrate(committed)
    const current = await this.requiredRow(snapshot.id)
    if (current.canonical_input !== snapshot.canonicalInput) throw new StartKeyConflictError()
    if (current.lease_token !== leaseToken || current.lease_expires_at == null || epoch(current.lease_expires_at, 'leaseExpiresAt') <= now) throw new LeaseConflictError()
    throw new RevisionConflictError()
  }

  async requestCancellation(id: string, expectedRevision: number, now: number): Promise<WorkflowSnapshot> {
    safeInteger(expectedRevision, 'expectedRevision')
    epoch(now, 'now')
    const cancelled = (await this.executeRows(sql`update workflows set cancellation_requested = ${true}, revision = revision + ${1}, updated_at = ${now} where id = ${id} and revision = ${expectedRevision} returning *`))[0]
    if (cancelled) return hydrate(cancelled)
    await this.requiredRow(id)
    throw new RevisionConflictError()
  }

  private async requiredRow(id: string): Promise<Row> {
    const row = (await this.executeRows(sql`select * from workflows where id = ${id} limit ${1}`))[0]
    if (!row) throw new Error(`Workflow not found: ${id}`)
    return row
  }
}

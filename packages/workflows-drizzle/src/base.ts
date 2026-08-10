import { sql, type SQL } from 'drizzle-orm'
import { assertWorkflowIdentityUnchanged, assertWorkflowSnapshot, assertWorkflowStoreExpectedRevision, assertWorkflowStoreLeaseArguments, assertWorkflowStoreLeaseToken, assertWorkflowStoreTimestamp, assertWorkflowVersion, LeaseConflictError, normalizePersistedWorkflowSnapshot, normalizeWorkflowSnapshot, RevisionConflictError, StartKeyConflictError, UnsupportedWorkflowSnapshotFormatError, type JsonValue, type RecoverableWorkflowStore, type StepSnapshot, type WorkflowRecoveryPage, type WorkflowRecoveryQuery, type WorkflowSnapshot, type WorkflowState } from '@luckys_luis/nuxt-laravelize-workflows'

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

const serialize = (candidate: WorkflowSnapshot): string => {
  const snapshot = normalizeWorkflowSnapshot(candidate)
  assertWorkflowSnapshot(snapshot)
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

const boolean = (value: unknown): boolean => {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  throw new TypeError('Invalid persisted workflow boolean')
}

const hydrate = (row: Row, mode: 'persisted-read' | 'mutation-receipt'): WorkflowSnapshot => {
  let body: unknown
  try {
    body = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot
  }
  catch { throw new TypeError('Invalid persisted workflow snapshot JSON') }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Invalid persisted workflow snapshot')
  const raw = body as Partial<WorkflowSnapshot>
  const format = raw.snapshotFormatVersion === undefined ? 1 : raw.snapshotFormatVersion
  if (format !== 1) throw new UnsupportedWorkflowSnapshotFormatError(format, typeof raw.id === 'string' ? raw.id : undefined)
  const persisted = { ...raw, snapshotFormatVersion: 1 } as WorkflowSnapshot
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
  assertWorkflowVersion(result.workflowVersion, true)
  if (result.lease === undefined) delete result.lease
  return mode === 'persisted-read'
    ? normalizePersistedWorkflowSnapshot(result)
    : normalizeWorkflowSnapshot(result)
}

const hydratePersistedRead = (row: Row): WorkflowSnapshot => hydrate(row, 'persisted-read')
const hydrateMutationReceipt = (row: Row): WorkflowSnapshot => hydrate(row, 'mutation-receipt')

export abstract class DrizzleWorkflowStore implements RecoverableWorkflowStore {
  readonly durability = 'durable' as const
  protected constructor(private readonly executeRows: WorkflowQueryExecutor) {}

  async create(snapshot: WorkflowSnapshot): Promise<{ snapshot: WorkflowSnapshot, created: boolean }> {
    const payload = serialize(snapshot)
    const inserted = (await this.executeRows(sql`insert into workflows (id, workflow_name, workflow_version, start_key, canonical_input, snapshot, state, revision, cancellation_requested, lease_token, lease_expires_at, created_at, updated_at) values (${snapshot.id}, ${snapshot.workflowName}, ${snapshot.workflowVersion}, ${snapshot.startKey}, ${snapshot.canonicalInput}, ${payload}, ${snapshot.state}, ${snapshot.revision}, ${snapshot.cancellationRequested}, ${snapshot.lease?.token ?? null}, ${snapshot.lease?.expiresAt ?? null}, ${snapshot.createdAt}, ${snapshot.updatedAt}) on conflict do nothing returning *`))[0]
    if (inserted) return { snapshot: hydrateMutationReceipt(inserted), created: true }
    const candidates = await this.executeRows(sql`select * from workflows where id = ${snapshot.id} or (workflow_name = ${snapshot.workflowName} and workflow_version = ${snapshot.workflowVersion} and start_key = ${snapshot.startKey})`)
    const existing = candidates.find(row => row.workflow_name === snapshot.workflowName && row.workflow_version === snapshot.workflowVersion && row.start_key === snapshot.startKey)
    if (!existing || existing.canonical_input !== snapshot.canonicalInput) throw new StartKeyConflictError()
    return { snapshot: hydratePersistedRead(existing), created: false }
  }

  async get(id: string): Promise<WorkflowSnapshot | null> {
    const row = (await this.executeRows(sql`select * from workflows where id = ${id} limit ${1}`))[0]
    return row ? hydratePersistedRead(row) : null
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
    assertWorkflowStoreLeaseArguments(expectedRevision, token, now, expiresAt)
    const observed = hydratePersistedRead(await this.requiredRow(id))
    const payload = serialize(observed)
    const claimed = (await this.executeRows(sql`update workflows set snapshot = ${payload}, revision = revision + ${1}, lease_token = ${token}, lease_expires_at = ${expiresAt}, updated_at = case when updated_at > ${now} then updated_at else ${now} end where id = ${id} and revision = ${expectedRevision} and revision = ${observed.revision} and cancellation_requested = ${observed.cancellationRequested} and (lease_token is null or lease_expires_at <= ${now}) returning *`))[0]
    if (claimed) return hydrateMutationReceipt(claimed)
    const current = await this.requiredRow(id)
    if (safeInteger(current.revision, 'revision') !== expectedRevision) throw new RevisionConflictError()
    throw new LeaseConflictError()
  }

  async renewLease(id: string, expectedRevision: number, token: string, now: number, expiresAt: number): Promise<WorkflowSnapshot> {
    assertWorkflowStoreLeaseArguments(expectedRevision, token, now, expiresAt)
    const observed = hydratePersistedRead(await this.requiredRow(id))
    const payload = serialize(observed)
    const renewed = (await this.executeRows(sql`update workflows set snapshot = ${payload}, lease_expires_at = case when lease_expires_at > ${expiresAt} then lease_expires_at else ${expiresAt} end where id = ${id} and lease_token = ${token} and lease_expires_at > ${now} and revision = ${observed.revision} and cancellation_requested = ${observed.cancellationRequested} and (revision = ${expectedRevision} or (revision = ${expectedRevision + 1} and cancellation_requested = ${true})) returning *`))[0]
    if (renewed) return hydrateMutationReceipt(renewed)
    const current = await this.requiredRow(id)
    if (current.lease_token !== token || current.lease_expires_at == null || epoch(current.lease_expires_at, 'leaseExpiresAt') <= now) throw new LeaseConflictError()
    throw new RevisionConflictError()
  }

  async commit(snapshot: WorkflowSnapshot, expectedRevision: number, leaseToken: string, now: number, releaseLease = true): Promise<WorkflowSnapshot> {
    assertWorkflowStoreExpectedRevision(expectedRevision)
    assertWorkflowStoreLeaseToken(leaseToken)
    assertWorkflowStoreTimestamp(now, 'now')
    snapshot = normalizeWorkflowSnapshot(snapshot)
    const payload = serialize(snapshot)
    const currentBeforeCommit = hydratePersistedRead(await this.requiredRow(snapshot.id))
    assertWorkflowIdentityUnchanged(currentBeforeCommit, snapshot)
    const committed = (await this.executeRows(sql`update workflows set snapshot = ${payload}, state = ${snapshot.state}, revision = revision + ${1}, cancellation_requested = case when cancellation_requested = ${true} or ${snapshot.cancellationRequested} = ${true} then ${true} else ${false} end, lease_token = case when ${releaseLease} = ${true} then null else lease_token end, lease_expires_at = case when ${releaseLease} = ${true} then null else lease_expires_at end, updated_at = case when updated_at > ${snapshot.updatedAt} then updated_at else ${snapshot.updatedAt} end where id = ${snapshot.id} and workflow_name = ${snapshot.workflowName} and workflow_version = ${snapshot.workflowVersion} and start_key = ${snapshot.startKey} and canonical_input = ${snapshot.canonicalInput} and created_at = ${snapshot.createdAt} and lease_token = ${leaseToken} and lease_expires_at > ${now} and ((${snapshot.state} <> ${'completed'} and ${snapshot.state} <> ${'failed'}) or cancellation_requested = ${false}) and (revision = ${expectedRevision} or (revision = ${expectedRevision + 1} and cancellation_requested = ${true} and ${snapshot.state} <> ${'completed'} and ${snapshot.state} <> ${'failed'})) returning *`))[0]
    if (committed) return hydrateMutationReceipt(committed)
    const current = await this.requiredRow(snapshot.id)
    assertWorkflowIdentityUnchanged(hydratePersistedRead(current), snapshot)
    if (current.lease_token !== leaseToken || current.lease_expires_at == null || epoch(current.lease_expires_at, 'leaseExpiresAt') <= now) throw new LeaseConflictError()
    throw new RevisionConflictError()
  }

  async requestCancellation(id: string, expectedRevision: number, now: number): Promise<WorkflowSnapshot> {
    assertWorkflowStoreExpectedRevision(expectedRevision)
    assertWorkflowStoreTimestamp(now, 'now')
    const observed = hydratePersistedRead(await this.requiredRow(id))
    const payload = serialize(observed)
    const cancelled = (await this.executeRows(sql`update workflows set snapshot = ${payload}, cancellation_requested = ${true}, revision = revision + ${1}, updated_at = case when updated_at > ${now} then updated_at else ${now} end where id = ${id} and revision = ${expectedRevision} and revision = ${observed.revision} and cancellation_requested = ${observed.cancellationRequested} and state <> ${'completed'} and state <> ${'failed'} and state <> ${'compensated'} and state <> ${'compensation_failed'} and state <> ${'cancelled'} returning *`))[0]
    if (cancelled) return hydrateMutationReceipt(cancelled)
    await this.requiredRow(id)
    throw new RevisionConflictError()
  }

  private async requiredRow(id: string): Promise<Row> {
    const row = (await this.executeRows(sql`select * from workflows where id = ${id} limit ${1}`))[0]
    if (!row) throw new Error(`Workflow not found: ${id}`)
    return row
  }
}

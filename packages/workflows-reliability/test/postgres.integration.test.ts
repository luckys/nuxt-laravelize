import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DrizzleTransactionManager, type DrizzleAsyncTransactionSource } from '@nuxt-laravelize/database-drizzle'
import { DrizzleDeadLetterOperationStore, DrizzlePostgresReliabilityStore, DrizzleReliabilityDeadLetterAdapter, type DrizzleReliabilityDatabase } from '@nuxt-laravelize/reliability-drizzle'
import { createEnvelope } from '@nuxt-laravelize/reliability'
import { defineStep, defineWorkflow, InvalidWorkflowSnapshotError, InvalidWorkflowVersionError, LeaseConflictError, RevisionConflictError, UnsupportedWorkflowSnapshotFormatError, WorkflowIdentityConflictError, WorkflowManager, WorkflowRegistry, WorkflowStoreContractError, type WorkflowStore } from '@nuxt-laravelize/workflows'
import { DrizzlePostgresWorkflowStore, type DrizzlePostgresWorkflowDatabase } from '@nuxt-laravelize/workflows-drizzle'
import { TransactionalWorkflowStore, type TransactionalOutboxAppender, WorkflowWakeReconciler, workflowWakeMessageType } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for the PostgreSQL integration test')

type Session = DrizzlePostgresWorkflowDatabase & DrizzleReliabilityDatabase
const schema = `workflow_reliability_${process.pid}_${Date.now()}`
const client = postgres(databaseUrl, { max: 1 })
const database = drizzle(client)
const migrations = [
  new URL('../../workflows-drizzle/migrations/0000_workflows_postgres.sql', import.meta.url),
  new URL('../../reliability-drizzle/migrations/0000_reliability_postgres.sql', import.meta.url),
  new URL('../../reliability-drizzle/migrations/0002_reliability_append_availability_postgres.sql', import.meta.url),
  new URL('../../reliability-drizzle/migrations/0004_reliability_terminal_at_postgres.sql', import.meta.url),
  new URL('../../reliability-drizzle/migrations/0006_reliability_dead_letter_management_postgres.sql', import.meta.url),
  new URL('../../reliability-drizzle/migrations/0008_reliability_dead_letter_operations_postgres.sql', import.meta.url),
  new URL('../../reliability-drizzle/migrations/0010_generalize_dead_letter_operations_postgres.sql', import.meta.url),
]

const definition = defineWorkflow({ name: 'postgres-proof', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })

describe('PostgreSQL transactional workflow wake-ups', () => {
  beforeAll(async () => {
    await client.unsafe(`create schema "${schema}"`)
    await client.unsafe(`set search_path to "${schema}"`)
    for (const migration of migrations) await client.unsafe(await readFile(migration, 'utf8'))
    await client.unsafe('create table domain_markers (id text primary key)')
  })

  afterAll(async () => {
    await client.unsafe(`drop schema if exists "${schema}" cascade`)
    await client.end()
  })

  function setup(id: string, outbox: TransactionalOutboxAppender<Session> = new DrizzlePostgresReliabilityStore(database)) {
    const transactions = new DrizzleTransactionManager(database as unknown as DrizzleAsyncTransactionSource<Session>)
    let wake = 0
    const store = new TransactionalWorkflowStore({
      transactions,
      readStore: new DrizzlePostgresWorkflowStore(database),
      storeForSession: session => new DrizzlePostgresWorkflowStore(session),
      outbox,
      idFactory: () => ++wake === 1 ? `wake-${id}` : `wake-${id}-${wake}`,
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => id, clock: { now: () => 100 } })
    return { manager, store, transactions }
  }

  it('reserves and replays durable dead-letter operations on real PostgreSQL', async () => {
    const store = new DrizzlePostgresReliabilityStore(database)
    const id = 'postgres-dead-letter'
    await store.append(createEnvelope({ id, type: 'test.dead.v1', occurredAt: new Date(0).toISOString(), payload: { private: true } }))
    const [claimed] = await store.claim({ owner: 'worker', token: 'claim-dead-letter', limit: 1, now: new Date(0).toISOString(), leaseUntil: new Date(1000).toISOString() })
    await store.dead('outbox', id, claimed!.leaseToken!, new Date(100).toISOString(), 'Bearer private-token')
    const adapter = new DrizzleReliabilityDeadLetterAdapter(database, () => new Date(200))
    const [item] = (await adapter.list({ namespace: 'outbox', type: 'test.dead.v1' })).items
    expect(item).not.toHaveProperty('error')
    const request = { key: item!.key, revision: item!.revision, operationId: 'postgres-discard-operation', reason: 'operator-reviewed' }
    const committed = await adapter.discard(request)
    expect(await adapter.discard(request)).toEqual(committed)
    expect((await client`select status, fingerprint, failure_code from reliability_dead_letter_operations where operation_id = ${request.operationId}`)[0]).toMatchObject({ status: 'committed', failure_code: null })
  })

  it('preserves legacy receipts while generalizing dead-letter operations', async () => {
    const upgradeSchema = `dead_letter_upgrade_${process.pid}_${Date.now()}`
    const legacy = await readFile(new URL('../../reliability-drizzle/migrations/0008_reliability_dead_letter_operations_postgres.sql', import.meta.url), 'utf8')
    const upgrade = await readFile(new URL('../../reliability-drizzle/migrations/0010_generalize_dead_letter_operations_postgres.sql', import.meta.url), 'utf8')
    try {
      await client.unsafe(`create schema "${upgradeSchema}"`)
      await client.unsafe(`set search_path to "${upgradeSchema}"`)
      await client.unsafe(legacy)
      await client.unsafe(`insert into reliability_dead_letter_operations (operation_id, fingerprint, source, message_kind, message_id, action, status, reserved_at, resolved_at, result_revision, result_disposition, failure_code) values
        ('legacy-pending', repeat('a', 64), 'reliability', 'outbox', 'pending-1', 'retry', 'pending', now(), null, null, null, null),
        ('legacy-committed', repeat('b', 64), 'reliability', 'outbox', 'committed-1', 'discard', 'committed', now(), now(), 7, 'discarded', null),
        ('legacy-failed', repeat('c', 64), 'reliability', 'outbox', 'failed-1', 'retry', 'failed', now(), now(), null, null, 'stale_revision')`)

      await client.unsafe(upgrade)

      const stored = await client`select operation_id, status, result_revision from reliability_dead_letter_operations order by operation_id`
      expect(stored).toEqual([
        expect.objectContaining({ operation_id: 'legacy-committed', status: 'committed', result_revision: '7' }),
        expect.objectContaining({ operation_id: 'legacy-failed', status: 'failed', result_revision: null }),
        expect.objectContaining({ operation_id: 'legacy-pending', status: 'pending', result_revision: null }),
      ])
      const operations = new DrizzleDeadLetterOperationStore(database, () => new Date(1_000))
      expect(await operations.reserve('bullmq-upgrade', 'd'.repeat(64))).toBe('reserved')
      await operations.finalize('bullmq-upgrade', 'd'.repeat(64), {
        status: 'committed',
        result: { key: { source: 'bullmq', namespace: 'emails', id: 'job-1' }, disposition: 'active', revision: 'opaque_revision-v1', operationId: 'bullmq-upgrade', committedAt: new Date(2_000).toISOString() },
      })
      await expect(operations.get('bullmq-upgrade')).resolves.toMatchObject({ status: 'committed', result: { revision: 'opaque_revision-v1' } })
    }
    finally {
      await client.unsafe(`set search_path to "${schema}"`)
      await client.unsafe(`drop schema if exists "${upgradeSchema}" cascade`)
    }
  })

  it('commits workflow and wake-up rows together', async () => {
    await setup('committed').manager.start(definition, {}, 'committed')
    const workflows = await client`select id from workflows where id = 'committed'`
    const messages = await client`select envelope, state from reliability_messages where kind = 'outbox' and id = 'wake-committed'`
    expect(workflows).toHaveLength(1)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ state: 'pending', envelope: { type: workflowWakeMessageType, payload: { workflowId: 'committed' } } })
  })

  it('enforces snapshot format, relational version, and immutable identity on real PostgreSQL', async () => {
    const legacy = setup('postgres-legacy-format')
    await legacy.manager.start(definition, {}, 'postgres-legacy-format')
    await client`update workflows set snapshot = snapshot - 'snapshotFormatVersion' where id = 'postgres-legacy-format'`
    await expect(legacy.store.get('postgres-legacy-format')).resolves.toMatchObject({ snapshotFormatVersion: 1 })

    const unknown = setup('postgres-unknown-format')
    await unknown.manager.start(definition, {}, 'postgres-unknown-format')
    await client`update workflows set snapshot = jsonb_set(snapshot, '{snapshotFormatVersion}', '2'::jsonb) where id = 'postgres-unknown-format'`
    await expect(unknown.store.get('postgres-unknown-format')).rejects.toBeInstanceOf(UnsupportedWorkflowSnapshotFormatError)

    const invalid = setup('postgres-invalid-version')
    await invalid.manager.start(definition, {}, 'postgres-invalid-version')
    await client`update workflows set workflow_version = 'latest' where id = 'postgres-invalid-version'`
    await expect(invalid.store.get('postgres-invalid-version')).rejects.toBeInstanceOf(InvalidWorkflowVersionError)

    const immutable = setup('postgres-immutable-identity')
    const started = await immutable.manager.start(definition, {}, 'postgres-immutable-identity')
    const claimed = await immutable.store.claim(started.id, started.revision, 'identity-owner', 100, 200)
    await expect(immutable.store.commit({ ...claimed, workflowVersion: '2' }, claimed.revision, 'identity-owner', 110)).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
    expect((await client`select workflow_version, revision from workflows where id = 'postgres-immutable-identity'`)[0]).toMatchObject({ workflow_version: '1', revision: String(claimed.revision) })
    await client`delete from workflows where id in ('postgres-invalid-version', 'postgres-unknown-format')`
  })

  it('bounds previous-release PostgreSQL errors and rejects an ambiguous terminal cancellation race', async () => {
    const id = 'postgres-legacy-error'
    const context = setup(id)
    const started = await context.manager.start(definition, {}, id)
    const legacy = {
      ...started,
      state: 'failed' as const,
      steps: [{ ...started.steps[0]!, state: 'failed' as const, attempts: 1, error: { name: '', message: 'M'.repeat(5000) } }],
    }
    await client`update workflows set state = ${legacy.state}, snapshot = ${JSON.stringify(legacy)}::jsonb where id = ${id}`

    await expect(context.store.get(id)).resolves.toMatchObject({ steps: [{ error: { name: 'Error', message: 'M'.repeat(4096) } }] })

    const ambiguous = { ...legacy, cancellationRequested: true }
    await client`update workflows set cancellation_requested = true, snapshot = ${JSON.stringify(ambiguous)}::jsonb where id = ${id}`
    await expect(context.store.get(id)).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
  })

  it('processes an active legacy waiting row and persists bounded snapshot JSON', async () => {
    const id = 'postgres-active-legacy-error'
    const context = setup(id)
    const started = await context.manager.start(definition, {}, id)
    const legacy = {
      ...started,
      state: 'waiting_retry' as const,
      steps: [{ ...started.steps[0]!, state: 'waiting_retry' as const, attempts: 1, retryAt: 99, error: { name: '', message: 'M'.repeat(5000) } }],
    }
    await client`update workflows set state = ${legacy.state}, snapshot = ${JSON.stringify(legacy)}::jsonb where id = ${id}`

    await expect(context.store.claim(id, started.revision, 'legacy-worker', 100, 200)).resolves.toMatchObject({ state: 'waiting_retry', lease: { token: 'legacy-worker' } })
    const [persisted] = await client`select snapshot from workflows where id = ${id}`
    expect(persisted!.snapshot.steps[0].error).toEqual({ name: 'Error', message: 'M'.repeat(4096) })
    await client`delete from workflows where id = ${id}`
  })

  it('rolls workflow creation back when the outbox append fails', async () => {
    const durableOutbox = new DrizzlePostgresReliabilityStore(database)
    const failingOutbox = {
      appendIn: async (...args: Parameters<typeof durableOutbox.appendIn>) => {
        await durableOutbox.appendIn(...args)
        throw new Error('forced outbox failure')
      },
    }
    await expect(setup('outbox-rollback', failingOutbox).manager.start(definition, {}, 'outbox-rollback')).rejects.toThrow('forced outbox failure')
    expect(await client`select id from workflows where id = 'outbox-rollback'`).toHaveLength(0)
    expect(await client`select id from reliability_messages where id = 'wake-outbox-rollback'`).toHaveLength(0)
  })

  it('rolls a real workflow commit back when the session store returns a forged receipt', async () => {
    const id = 'forged-commit-rollback'
    const base = setup(id)
    const started = await base.manager.start(definition, {}, id)
    const claimed = await base.store.claim(id, started.revision, 'forged-owner', 100, 300)
    const before = (await client`select state, revision from workflows where id = ${id}`)[0]!
    const wakesBefore = await client`select id from reliability_messages where kind = 'outbox' and envelope -> 'payload' ->> 'workflowId' = ${id}`
    const forged = new TransactionalWorkflowStore<Session>({
      transactions: base.transactions,
      readStore: new DrizzlePostgresWorkflowStore(database),
      storeForSession: (session) => {
        const real = new DrizzlePostgresWorkflowStore(session)
        return {
          create: value => real.create(value), get: workflowId => real.get(workflowId), claim: (...args) => real.claim(...args), renewLease: (...args) => real.renewLease(...args),
          requestCancellation: (...args) => real.requestCancellation(...args),
          commit: async (...args) => ({ ...(await real.commit(...args)), revision: 999 }),
        } satisfies WorkflowStore
      },
      outbox: new DrizzlePostgresReliabilityStore(database),
      idFactory: () => 'must-not-append-forged-commit',
    })
    const candidate = { ...claimed, state: 'running' as const, updatedAt: 120, steps: [{ ...claimed.steps[0]!, state: 'running' as const, attempts: 1 }] }

    await expect(forged.commit(candidate, claimed.revision, 'forged-owner', 120)).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect((await client`select state, revision from workflows where id = ${id}`)[0]).toEqual(before)
    expect(await client`select id from reliability_messages where kind = 'outbox' and envelope -> 'payload' ->> 'workflowId' = ${id}`).toHaveLength(wakesBefore.length)
    expect(await client`select id from reliability_messages where id = 'must-not-append-forged-commit'`).toHaveLength(0)
  })

  it('rolls domain, workflow, and outbox rows back in a caller-owned transaction', async () => {
    const { manager, store, transactions } = setup('domain-rollback')
    await expect(transactions.transaction(async (unitOfWork) => {
      await unitOfWork.session.execute(drizzleSql`insert into domain_markers (id) values (${'domain-rollback'})`)
      await manager.using(store.in(unitOfWork)).start(definition, {}, 'domain-rollback')
      throw new Error('rollback domain transaction')
    })).rejects.toThrow('rollback domain transaction')
    expect(await client`select id from domain_markers where id = 'domain-rollback'`).toHaveLength(0)
    expect(await client`select id from workflows where id = 'domain-rollback'`).toHaveLength(0)
    expect(await client`select id from reliability_messages where id = 'wake-domain-rollback'`).toHaveLength(0)
  })

  it('keeps a caller-owned transaction rollback-only when it catches an outbox failure', async () => {
    const id = 'caught-outbox-rollback'
    const durableOutbox = new DrizzlePostgresReliabilityStore(database)
    const failure = new Error('caught post-append failure')
    const failingOutbox = {
      appendIn: async (...args: Parameters<typeof durableOutbox.appendIn>) => {
        await durableOutbox.appendIn(...args)
        throw failure
      },
    }
    const { manager, store, transactions } = setup(id, failingOutbox)

    await expect(transactions.transaction(async (unitOfWork) => {
      await unitOfWork.session.execute(drizzleSql`insert into domain_markers (id) values (${id})`)
      try {
        await manager.using(store.in(unitOfWork)).start(definition, {}, id)
      }
      catch (error) { expect(error).toBe(failure) }
      return 'caught'
    })).rejects.toBe(failure)
    expect(await client`select id from domain_markers where id = ${id}`).toHaveLength(0)
    expect(await client`select id from workflows where id = ${id}`).toHaveLength(0)
    expect(await client`select id from reliability_messages where id = ${`wake-${id}`}`).toHaveLength(0)
  })

  it('renews workflow lease and replacement wake without revision churn', async () => {
    const { manager, store } = setup('lease-renewal')
    const started = await manager.start(definition, {}, 'lease-renewal')
    const claimed = await store.claim(started.id, started.revision, 'renew-owner', 100, 200)
    const renewed = await store.renewLease(started.id, claimed.revision, 'renew-owner', 120, 300)

    expect(renewed).toMatchObject({ revision: claimed.revision, updatedAt: 100, lease: { token: 'renew-owner', expiresAt: 300 } })
    const wakes = await client`select id, available_at from reliability_messages where id in ('wake-lease-renewal-2', 'wake-lease-renewal-3') order by id`
    expect(wakes.map(row => [row.id, new Date(row.available_at).toISOString()])).toEqual([
      ['wake-lease-renewal-2', new Date(200).toISOString()],
      ['wake-lease-renewal-3', new Date(300).toISOString()],
    ])
  })

  it('preserves a longer PostgreSQL lease across backward clock renewal', async () => {
    const { manager, store } = setup('lease-renewal-backward-clock')
    const started = await manager.start(definition, {}, 'lease-renewal-backward-clock')
    const claimed = await store.claim(started.id, started.revision, 'renew-owner', 100, 1_000)
    const renewed = await store.renewLease(started.id, claimed.revision, 'renew-owner', 50, 500)
    expect(renewed.lease?.expiresAt).toBe(1_000)
    await expect(store.claim(started.id, claimed.revision, 'other-owner', 500, 1_500)).rejects.toBeInstanceOf(LeaseConflictError)
    expect((await store.get(started.id))?.lease?.expiresAt).toBe(1_000)
  })

  it('fences a PostgreSQL forward failure racing cancellation without rerunning the handler', async () => {
    let rejectAttempt!: (error: Error) => void
    let handlerStarted!: () => void
    const startedHandler = new Promise<void>((resolve) => {
      handlerStarted = resolve
    })
    const run = vi.fn(() => new Promise<never>((_resolve, reject) => {
      rejectAttempt = reject
      handlerStarted()
    }))
    const raceDefinition = defineWorkflow({ name: 'postgres-race', version: '1', steps: [defineStep({ name: 'reject', run })] })
    const id = 'postgres-failed-cancellation-race'
    const transactions = new DrizzleTransactionManager(database as unknown as DrizzleAsyncTransactionSource<Session>)
    const store = new TransactionalWorkflowStore({
      transactions,
      readStore: new DrizzlePostgresWorkflowStore(database),
      storeForSession: session => new DrizzlePostgresWorkflowStore(session),
      outbox: new DrizzlePostgresReliabilityStore(database),
      idFactory: () => crypto.randomUUID(),
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(raceDefinition), { idFactory: () => id, clock: { now: () => 100 }, leaseDurationMs: 1_000, heartbeatIntervalMs: 900 })
    const started = await manager.start(raceDefinition, {}, id)
    const processing = manager.process(started.id)
    await startedHandler
    await manager.cancel(id)
    rejectAttempt(new Error('terminal rejection'))

    await expect(processing).resolves.toMatchObject({ state: 'cancelled', cancellationRequested: true, steps: [{ state: 'failed', attempts: 1, error: { message: 'terminal rejection' } }] })
    expect(run).toHaveBeenCalledOnce()
    expect(await store.get(id)).toMatchObject({ state: 'cancelled', cancellationRequested: true })
  })

  it('rejects direct terminal cancellation and invalid PostgreSQL mutations without changing rows', async () => {
    const terminal = setup('postgres-terminal-cancellation')
    const started = await terminal.manager.start(definition, {}, 'postgres-terminal-cancellation')
    const completed = await terminal.manager.run(started.id)
    await expect(terminal.store.requestCancellation(completed.id, completed.revision, 100)).rejects.toBeInstanceOf(RevisionConflictError)
    expect(await terminal.store.get(completed.id)).toEqual(completed)

    const active = setup('postgres-invalid-mutation')
    const before = await active.manager.start(definition, {}, 'postgres-invalid-mutation')
    await expect(active.store.claim(before.id, -1, 'lease', 0, 1)).rejects.toThrow(TypeError)
    await expect(active.store.claim(before.id, before.revision, '', 0, 1)).rejects.toThrow(TypeError)
    await expect(active.store.requestCancellation(before.id, before.revision, -1)).rejects.toThrow(TypeError)
    expect(await active.store.get(before.id)).toEqual(before)
  })

  it('keeps claim and cancellation timestamps monotonic across skewed managers on PostgreSQL', async () => {
    const id = 'postgres-clock-skew'
    const base = setup(id)
    const registry = new WorkflowRegistry().register(definition)
    const fast = new WorkflowManager(base.store, registry, { idFactory: () => id, clock: { now: () => 200 } })
    const slow = new WorkflowManager(base.store, registry, { tokenFactory: () => 'skewed-owner', clock: { now: () => 100 } })
    const started = await fast.start(definition, {}, id)

    const processed = await slow.process(started.id)
    expect(processed.updatedAt).toBe(200)
    const cancelled = await slow.cancel(started.id)
    expect(cancelled.updatedAt).toBe(200)
    expect((await client`select updated_at from workflows where id = ${id}`)[0]?.updated_at).toBe('200')
  })

  it('preserves a dead wake and appends a fresh recoverable wake', async () => {
    await setup('reconciled').manager.start(definition, {}, 'reconciled')
    await setup('reconcile-invalid-version').manager.start(definition, {}, 'reconcile-invalid-version')
    await setup('reconcile-unknown-format').manager.start(definition, {}, 'reconcile-unknown-format')
    await client`update workflows set workflow_version = 'latest' where id = 'reconcile-invalid-version'`
    await client`update workflows set snapshot = jsonb_set(snapshot, '{snapshotFormatVersion}', '2'::jsonb) where id = 'reconcile-unknown-format'`
    await client`update reliability_messages set state = 'dead', last_error = 'forced dead wake' where kind = 'outbox' and id = 'wake-reconciled'`
    const workflowStore = new DrizzlePostgresWorkflowStore(database)
    const reliabilityStore = new DrizzlePostgresReliabilityStore(database)
    let recoveryId = 0
    const reconciler = new WorkflowWakeReconciler(workflowStore, reliabilityStore, { resolver: new WorkflowRegistry().register(definition), clock: () => 200, idFactory: () => `wake-recovery-${++recoveryId}` })

    const result = await reconciler.reconcileStore({ pageSize: 1 })
    expect(result.scheduled).toContain('reconciled')
    expect(result.failed).toHaveLength(2)
    expect(result.failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ workflowId: 'reconcile-invalid-version', error: expect.any(InvalidWorkflowVersionError) }),
      expect.objectContaining({ workflowId: 'reconcile-unknown-format', error: expect.any(UnsupportedWorkflowSnapshotFormatError) }),
    ]))
    const original = await client`select id, state from reliability_messages where id = 'wake-reconciled'`
    const fresh = await client`select id, state, envelope from reliability_messages where kind = 'outbox' and id <> 'wake-reconciled' and envelope -> 'payload' ->> 'workflowId' = 'reconciled'`
    const invalidRecoveryWakes = await client`select id from reliability_messages where kind = 'outbox' and id like 'wake-recovery-%' and envelope -> 'payload' ->> 'workflowId' in ('reconcile-invalid-version', 'reconcile-unknown-format')`
    expect(original).toMatchObject([{ id: 'wake-reconciled', state: 'dead' }])
    expect(fresh).toMatchObject([{ state: 'pending', envelope: { type: workflowWakeMessageType, payload: { workflowId: 'reconciled' } } }])
    expect(invalidRecoveryWakes).toHaveLength(0)
    const claimed = await reliabilityStore.claim({
      owner: 'recovery-proof',
      token: 'recovery-token',
      limit: 10,
      now: new Date(200).toISOString(),
      leaseUntil: new Date(30_200).toISOString(),
      types: [workflowWakeMessageType],
    })
    expect(claimed.map(message => message.envelope.id)).toContain(fresh[0]!.id)
  })

  it('deduplicates concurrent reconciliation for the same generation', async () => {
    await setup('concurrent-recovery').manager.start(definition, {}, 'concurrent-recovery')
    const workflowStore = new DrizzlePostgresWorkflowStore(database)
    const reliabilityStore = new DrizzlePostgresReliabilityStore(database)
    const reconcile = () => new WorkflowWakeReconciler(workflowStore, reliabilityStore, { resolver: new WorkflowRegistry().register(definition), clock: () => 150, generationMs: 100 }).reconcile(['concurrent-recovery'])

    const results = await Promise.all([reconcile(), reconcile()])

    expect(results.every(result => result.failed.length === 0)).toBe(true)
    const wakes = await client`select id from reliability_messages where kind = 'outbox' and id <> 'wake-concurrent-recovery' and envelope -> 'payload' ->> 'workflowId' = 'concurrent-recovery'`
    expect(wakes).toHaveLength(1)
  })

  it('prunes only old delivered workflow wakes', async () => {
    const store = new DrizzlePostgresReliabilityStore(database)
    const append = async (id: string, type = workflowWakeMessageType) => store.append(createEnvelope({ id, type, occurredAt: new Date(0).toISOString(), payload: type === workflowWakeMessageType ? { workflowId: id } : null }))
    await append('prune-delivered')
    await append('prune-dead')
    await append('prune-pending')
    await append('prune-other', 'other.retention.v1')
    const finish = async (id: string, state: 'delivered' | 'dead') => {
      const excluded = (await client`select id from reliability_messages where kind = 'outbox' and id <> ${id}`).map(row => String(row.id))
      const [claimed] = await store.claim({ owner: 'retention', token: id, limit: 1, now: new Date(0).toISOString(), leaseUntil: new Date(1000).toISOString(), excludeIds: excluded })
      if (state === 'delivered') await store.delivered('outbox', id, claimed!.leaseToken!, new Date(100).toISOString())
      else await store.dead('outbox', id, claimed!.leaseToken!, new Date(100).toISOString(), 'preserve evidence')
    }
    await finish('prune-delivered', 'delivered')
    await finish('prune-dead', 'dead')
    await finish('prune-other', 'delivered')

    const result = await store.prune({ namespace: 'outbox', completedBefore: new Date(200).toISOString(), states: ['delivered'], types: [workflowWakeMessageType], limit: 10 })

    expect(result).toEqual({ deleted: 1, hasMore: false })
    const retained = await client`select id from reliability_messages where id in ('prune-delivered', 'prune-dead', 'prune-pending', 'prune-other') order by id`
    expect(retained.map(row => row.id)).toEqual(['prune-dead', 'prune-other', 'prune-pending'])
  })
})

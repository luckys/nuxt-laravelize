import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DrizzleTransactionManager, type DrizzleAsyncTransactionSource } from '@nuxt-laravelize/database-drizzle'
import { DrizzlePostgresReliabilityStore, DrizzleReliabilityDeadLetterAdapter, type DrizzleReliabilityDatabase } from '@nuxt-laravelize/reliability-drizzle'
import { createEnvelope } from '@nuxt-laravelize/reliability'
import { defineStep, defineWorkflow, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
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

  it('commits workflow and wake-up rows together', async () => {
    await setup('committed').manager.start(definition, {}, 'committed')
    const workflows = await client`select id from workflows where id = 'committed'`
    const messages = await client`select envelope, state from reliability_messages where kind = 'outbox' and id = 'wake-committed'`
    expect(workflows).toHaveLength(1)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({ state: 'pending', envelope: { type: workflowWakeMessageType, payload: { workflowId: 'committed' } } })
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

  it('preserves a dead wake and appends a fresh recoverable wake', async () => {
    await setup('reconciled').manager.start(definition, {}, 'reconciled')
    await client`update reliability_messages set state = 'dead', last_error = 'forced dead wake' where kind = 'outbox' and id = 'wake-reconciled'`
    const workflowStore = new DrizzlePostgresWorkflowStore(database)
    const reliabilityStore = new DrizzlePostgresReliabilityStore(database)
    let recoveryId = 0
    const reconciler = new WorkflowWakeReconciler(workflowStore, reliabilityStore, { clock: () => 200, idFactory: () => `wake-recovery-${++recoveryId}` })

    const result = await reconciler.reconcileStore({ pageSize: 1 })
    expect(result.scheduled).toContain('reconciled')
    expect(result.failed).toEqual([])
    const original = await client`select id, state from reliability_messages where id = 'wake-reconciled'`
    const fresh = await client`select id, state, envelope from reliability_messages where kind = 'outbox' and id <> 'wake-reconciled' and envelope -> 'payload' ->> 'workflowId' = 'reconciled'`
    expect(original).toMatchObject([{ id: 'wake-reconciled', state: 'dead' }])
    expect(fresh).toMatchObject([{ state: 'pending', envelope: { type: workflowWakeMessageType, payload: { workflowId: 'reconciled' } } }])
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
    const reconcile = () => new WorkflowWakeReconciler(workflowStore, reliabilityStore, { clock: () => 150, generationMs: 100 }).reconcile(['concurrent-recovery'])

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

import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DrizzleTransactionManager, type DrizzleAsyncTransactionSource } from '@nuxt-laravelize/database-drizzle'
import { DrizzlePostgresReliabilityStore, type DrizzleReliabilityDatabase } from '@nuxt-laravelize/reliability-drizzle'
import { defineStep, defineWorkflow, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
import { DrizzlePostgresWorkflowStore, type DrizzlePostgresWorkflowDatabase } from '@nuxt-laravelize/workflows-drizzle'
import { TransactionalWorkflowStore, type TransactionalOutboxAppender, workflowWakeMessageType } from '../src/index.js'

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
    const store = new TransactionalWorkflowStore({
      transactions,
      readStore: new DrizzlePostgresWorkflowStore(database),
      storeForSession: session => new DrizzlePostgresWorkflowStore(session),
      outbox,
      idFactory: () => `wake-${id}`,
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => id, clock: { now: () => 100 } })
    return { manager, store, transactions }
  }

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
})

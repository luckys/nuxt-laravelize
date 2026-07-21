import { describe, expect, it, vi } from 'vitest'
import type { TransactionManager, UnitOfWork } from '@nuxt-laravelize/database/runtime'
import type { MessageEnvelope, OutboxAppendOptions } from '@nuxt-laravelize/reliability'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
import { createWorkflowWakeHandler, TransactionalWorkflowStore, workflowWakeMessageType } from '../src/index.js'

type Session = { store: InMemoryWorkflowStore }

function setup() {
  const session: Session = { store: new InMemoryWorkflowStore() }
  const unitOfWork: UnitOfWork<Session> = { session, afterCommit: vi.fn() }
  const transactions: TransactionManager<Session> = { transaction: vi.fn(async work => await work(unitOfWork)) }
  const appended: Array<{ unitOfWork: UnitOfWork<Session>, envelope: MessageEnvelope, options?: OutboxAppendOptions }> = []
  const outbox = { appendIn: vi.fn(async (current: UnitOfWork<Session>, envelope: MessageEnvelope, options?: OutboxAppendOptions) => {
    appended.push({ unitOfWork: current, envelope, options })
  }) }
  let message = 0
  const store = new TransactionalWorkflowStore({ transactions, readStore: session.store, storeForSession: current => current.store, outbox, idFactory: () => `wake-${++message}` })
  return { appended, outbox, session, store, transactions, unitOfWork }
}

describe('transactional workflow outbox', () => {
  it('writes a new workflow and immediate wake-up through one unit of work', async () => {
    const { appended, store, transactions, unitOfWork } = setup()
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'workflow-1', clock: { now: () => 100 } })
    const first = await manager.start(definition, {}, 'same')
    await manager.start(definition, {}, 'same')
    expect(transactions.transaction).toHaveBeenCalledTimes(2)
    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({ unitOfWork, envelope: { type: workflowWakeMessageType, payload: { workflowId: first.id } }, options: { availableAt: new Date(100).toISOString() } })
  })

  it('records lease fallback and retry deadline but no retained-lease competitor', async () => {
    const { appended, store } = setup()
    const run = () => {
      throw new Error('later')
    }
    const definition = defineWorkflow({ name: 'retry', version: '1', steps: [defineStep({ name: 'work', maxAttempts: 2, run })] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'workflow-1', tokenFactory: () => 'lease', clock: { now: () => 100 }, leaseDurationMs: 30, retrySchedule: () => 50 })
    const started = await manager.start(definition, {}, 'retry')
    appended.length = 0
    await manager.processResult(started.id)
    expect(appended).toHaveLength(2)
    expect(appended.map(item => item.options?.availableAt)).toEqual([new Date(130).toISOString(), new Date(150).toISOString()])
  })

  it('emits cancellation wake-ups and stops emitting after terminal commits', async () => {
    const { appended, store } = setup()
    const definition = defineWorkflow({ name: 'cancel', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'workflow-1', tokenFactory: () => 'lease', clock: { now: () => 100 } })
    const started = await manager.start(definition, {}, 'cancel')
    appended.length = 0
    await manager.cancel(started.id)
    expect(appended).toHaveLength(1)
    await manager.run(started.id)
    expect((await manager.status(started.id))?.state).toBe('cancelled')
    expect(appended).toHaveLength(2)
  })

  it('joins a caller-owned transaction without opening a nested one', async () => {
    const { appended, store, transactions, unitOfWork } = setup()
    const definition = defineWorkflow({ name: 'joined', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })
    const manager = new WorkflowManager(new InMemoryWorkflowStore(), new WorkflowRegistry().register(definition), { idFactory: () => 'joined-1', clock: { now: () => 100 } })
    await manager.using(store.in(unitOfWork)).start(definition, {}, 'joined')
    expect(transactions.transaction).not.toHaveBeenCalled()
    expect(appended[0]?.unitOfWork).toBe(unitOfWork)
  })

  it('validates wake payloads and processes one authoritative transition', async () => {
    const manager = { processResult: vi.fn(async () => ({ outcome: 'terminal' })) } as unknown as WorkflowManager
    const handler = createWorkflowWakeHandler(manager)
    await handler({ version: 1, id: 'wake', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: 'workflow-1' } })
    expect(manager.processResult).toHaveBeenCalledWith('workflow-1')
    await expect(handler({ version: 1, id: 'bad', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: '', extra: true } })).rejects.toThrow(TypeError)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { TransactionManager, UnitOfWork } from '@nuxt-laravelize/database/runtime'
import type { MessageEnvelope, OutboxAppendOptions } from '@nuxt-laravelize/reliability'
import { InMemoryReliabilityStore } from '@nuxt-laravelize/reliability/testing'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, type WorkflowSnapshot, type WorkflowStore, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
import { createWorkflowWakeHandler, TransactionalWorkflowStore, WorkflowWakeReconciler, WorkflowWakeReconciliationWorker, workflowWakeMessageType, type WorkflowWakeReconcileResult } from '../src/index.js'

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

const snapshot = (id: string, overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot => ({
  id,
  workflowName: 'recovery',
  workflowVersion: '1',
  startKey: id,
  canonicalInput: '{}',
  input: {},
  state: 'pending',
  revision: 0,
  steps: [{ name: 'work', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: `${id}:work` }],
  cancellationRequested: false,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

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

  it('atomically records a replacement fallback for every lease renewal', async () => {
    const { appended, store, unitOfWork } = setup()
    await store.create(snapshot('renewed'))
    const claimed = await store.claim('renewed', 0, 'lease', 0, 100)
    appended.length = 0
    const renewed = await store.renewLease('renewed', claimed.revision, 'lease', 10, 200)
    expect(renewed).toMatchObject({ revision: claimed.revision, lease: { expiresAt: 200 } })
    expect(appended).toEqual([expect.objectContaining({ unitOfWork, options: { availableAt: new Date(200).toISOString() }, envelope: expect.objectContaining({ type: workflowWakeMessageType, payload: { workflowId: 'renewed' } }) })])
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
    const controller = new AbortController()
    await handler({ version: 1, id: 'wake', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: 'workflow-1' } }, { signal: controller.signal, leaseToken: 'lease', attempt: 1 })
    expect(manager.processResult).toHaveBeenCalledWith('workflow-1', { signal: controller.signal })
    await expect(handler({ version: 1, id: 'bad', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: '', extra: true } })).rejects.toThrow(TypeError)
  })
})

describe('workflow wake reconciliation', () => {
  it('bounds duplicate wakes while allowing recovery in a later generation', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshot('bounded'))
    const outbox = new InMemoryReliabilityStore()
    let now = 150
    const reconciler = new WorkflowWakeReconciler(store, outbox, { clock: () => now, generationMs: 100 })

    await reconciler.reconcile(['bounded'])
    await reconciler.reconcile(['bounded'])
    expect(outbox.records.size).toBe(1)

    now = 250
    await reconciler.reconcile(['bounded'])
    expect(outbox.records.size).toBe(2)
  })

  it('creates a distinct wake when authoritative state changes within a generation', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshot('changed'))
    const outbox = new InMemoryReliabilityStore()
    const reconciler = new WorkflowWakeReconciler(store, outbox, { clock: () => 150, generationMs: 100 })

    await reconciler.reconcile(['changed'])
    await store.requestCancellation('changed', 0, 160)
    await reconciler.reconcile(['changed'])

    expect(outbox.records.size).toBe(2)
  })

  it('rejects invalid recovery generations', () => {
    const store = new InMemoryWorkflowStore()
    const outbox = new InMemoryReliabilityStore()
    expect(() => new WorkflowWakeReconciler(store, outbox, { generationMs: 0 })).toThrow('generationMs must be an integer between 1 and 86400000')
  })

  it('schedules fresh wakes from authoritative retry and lease state', async () => {
    const store = new InMemoryWorkflowStore()
    const snapshots = [
      snapshot('pending'),
      snapshot('leased', { lease: { token: 'active', expiresAt: 150 } }),
      snapshot('expired', { lease: { token: 'expired', expiresAt: 90 } }),
      snapshot('waiting', { state: 'waiting_retry', steps: [{ name: 'work', state: 'waiting_retry', attempts: 1, compensationAttempts: 0, idempotencyKey: 'waiting:work', retryAt: 175 }] }),
      snapshot('elapsed', { state: 'waiting_retry', steps: [{ name: 'work', state: 'waiting_retry', attempts: 1, compensationAttempts: 0, idempotencyKey: 'elapsed:work', retryAt: 80 }] }),
      snapshot('terminal', { state: 'completed' }),
    ]
    for (const value of snapshots) await store.create(value)
    const appended: Array<{ envelope: MessageEnvelope, options?: OutboxAppendOptions }> = []
    let id = 0
    const reconciler = new WorkflowWakeReconciler(store, { append: async (envelope, options) => {
      appended.push({ envelope, options })
    } }, { clock: () => 100, idFactory: () => `recovery-${++id}` })

    const result = await reconciler.reconcile(snapshots.map(value => value.id))

    expect(result).toEqual({ scheduled: ['pending', 'leased', 'expired', 'waiting', 'elapsed'], skipped: ['terminal'], failed: [] })
    expect(appended.map(item => item.options?.availableAt)).toEqual([0, 150, 90, 175, 80].map(value => new Date(value).toISOString()))
    expect(appended.map(item => item.envelope)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'recovery-1', type: workflowWakeMessageType, payload: { workflowId: 'pending' } }),
    ]))
    expect(appended.every(item => Object.keys(item.envelope.payload as object).join() === 'workflowId')).toBe(true)
  })

  it('continues bounded discovery after per-workflow append failures', async () => {
    const store = new InMemoryWorkflowStore()
    for (const [index, id] of ['one', 'two', 'three'].entries()) await store.create(snapshot(id, { updatedAt: index + 1 }))
    const discover = vi.spyOn(store, 'discoverRecoverable')
    const reconciler = new WorkflowWakeReconciler(store, { append: async (envelope) => {
      if ((envelope.payload as { workflowId: string }).workflowId === 'two') throw new Error('outbox unavailable')
    } }, { clock: () => 10, idFactory: () => crypto.randomUUID() })

    const result = await reconciler.reconcileStore({ pageSize: 1 })

    expect(result.scheduled).toEqual(['one', 'three'])
    expect(result.failed).toMatchObject([{ workflowId: 'two', error: { message: 'outbox unavailable' } }])
    expect(discover.mock.calls.every(([query]) => query.updatedBefore === 10 && query.limit === 1)).toBe(true)
  })

  it('reports missing IDs and requires recovery discovery for store scans', async () => {
    const store = new InMemoryWorkflowStore()
    const outbox = { append: vi.fn(async () => {}) }
    const reconciler = new WorkflowWakeReconciler(store, outbox)
    expect(await reconciler.reconcile(['missing'])).toMatchObject({ failed: [{ workflowId: 'missing', error: { message: 'Workflow not found: missing' } }] })
    const basicStore: WorkflowStore = {
      create: value => store.create(value),
      get: id => store.get(id),
      claim: (...args) => store.claim(...args),
      renewLease: (...args) => store.renewLease(...args),
      commit: (...args) => store.commit(...args),
      requestCancellation: (...args) => store.requestCancellation(...args),
    }
    await expect(new WorkflowWakeReconciler(basicStore, outbox).reconcileStore()).rejects.toThrow('does not support recovery discovery')
  })
})

describe('workflow wake reconciliation worker', () => {
  const result = (): WorkflowWakeReconcileResult => ({ scheduled: [], skipped: [], failed: [] })
  const workerFor = (reconcileStore: () => Promise<WorkflowWakeReconcileResult>, options: ConstructorParameters<typeof WorkflowWakeReconciliationWorker>[1] = {}) => new WorkflowWakeReconciliationWorker({ reconcileStore } as unknown as WorkflowWakeReconciler, options)

  it('coalesces overlapping reconciliation cycles', async () => {
    let release!: (value: WorkflowWakeReconcileResult) => void
    const reconcileStore = vi.fn(async () => result()).mockImplementationOnce(() => new Promise<WorkflowWakeReconcileResult>((resolve) => {
      release = resolve
    }))
    const worker = workerFor(reconcileStore)

    const first = worker.runOnce()
    const second = worker.runOnce()
    expect(first).toBe(second)
    expect(reconcileStore).toHaveBeenCalledTimes(1)
    release(result())
    await first
    await worker.runOnce()
    expect(reconcileStore).toHaveBeenCalledTimes(2)
  })

  it('runs immediately and reports results until aborted', async () => {
    const controller = new AbortController()
    const onResult = vi.fn(() => controller.abort())
    const reconcileStore = vi.fn(async () => result())
    const worker = workerFor(reconcileStore, { intervalMs: 100, onResult })

    await worker.run(controller.signal)

    expect(reconcileStore).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(result())
  })

  it('coalesces overlapping run loops', async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    let release!: (value: WorkflowWakeReconcileResult) => void
    const reconcileStore = vi.fn(() => new Promise<WorkflowWakeReconcileResult>((resolve) => {
      release = resolve
    }))
    const worker = workerFor(reconcileStore)

    const first = worker.run(firstController.signal)
    const second = worker.run(secondController.signal)
    expect(first).toBe(second)
    secondController.abort()
    release(result())
    await first
    expect(reconcileStore).toHaveBeenCalledTimes(1)
  })

  it('waits for active reconciliation during shutdown', async () => {
    let release!: (value: WorkflowWakeReconcileResult) => void
    const worker = workerFor(() => new Promise<WorkflowWakeReconcileResult>((resolve) => {
      release = resolve
    }))
    const running = worker.runOnce()
    let stopped = false
    const stopping = worker.stop().then(() => {
      stopped = true
    })

    await Promise.resolve()
    expect(stopped).toBe(false)
    release(result())
    await Promise.all([running, stopping])
    await expect(worker.runOnce()).rejects.toBeDefined()
  })

  it('drains active work without waiting for the periodic loop', async () => {
    const controller = new AbortController()
    let release!: (value: WorkflowWakeReconcileResult) => void
    const worker = workerFor(() => new Promise<WorkflowWakeReconcileResult>((resolve) => {
      release = resolve
    }))
    const loop = worker.run(controller.signal)
    let drained = false
    const draining = worker.drain().then(() => {
      drained = true
    })

    await Promise.resolve()
    expect(drained).toBe(false)
    release(result())
    await draining
    expect(drained).toBe(true)
    controller.abort()
    await loop
  })

  it('does not hide an active cycle failure during shutdown', async () => {
    const controller = new AbortController()
    let reject!: (error: Error) => void
    const worker = workerFor(() => new Promise<WorkflowWakeReconcileResult>((_resolve, rejectCycle) => {
      reject = rejectCycle
    }))
    const loop = worker.run(controller.signal)
    controller.abort()
    reject(new Error('scan failed during shutdown'))

    await expect(loop).rejects.toThrow('scan failed during shutdown')
  })

  it('drains an overlapping cycle started while the loop sleeps', async () => {
    const controller = new AbortController()
    let reject!: (error: Error) => void
    let firstCompleted!: () => void
    const completed = new Promise<void>((resolve) => {
      firstCompleted = resolve
    })
    const reconcileStore = vi.fn(async () => result()).mockImplementationOnce(async () => {
      firstCompleted()
      return result()
    }).mockImplementationOnce(() => new Promise<WorkflowWakeReconcileResult>((_resolve, rejectCycle) => {
      reject = rejectCycle
    }))
    const worker = workerFor(reconcileStore, { intervalMs: 10_000 })
    const loop = worker.run(controller.signal)
    await completed
    await worker.drain()
    const overlapping = worker.runOnce()
    controller.abort()
    reject(new Error('overlapping scan failed'))

    await expect(loop).rejects.toThrow('overlapping scan failed')
    await expect(overlapping).rejects.toThrow('overlapping scan failed')
  })

  it('validates intervals and propagates cycle errors', async () => {
    expect(() => workerFor(async () => result(), { intervalMs: 0 })).toThrow('intervalMs must be an integer between 1 and 86400000')
    const worker = workerFor(async () => {
      throw new Error('discovery unavailable')
    })
    await expect(worker.run()).rejects.toThrow('discovery unavailable')
  })
})

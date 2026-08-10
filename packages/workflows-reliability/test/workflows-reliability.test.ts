import { describe, expect, it, vi } from 'vitest'
import type { TransactionManager, UnitOfWork } from '@luckys_luis/nuxt-laravelize-database/runtime'
import type { MessageEnvelope, OutboxAppendOptions } from '@luckys_luis/nuxt-laravelize-reliability'
import { InMemoryReliabilityStore } from '@luckys_luis/nuxt-laravelize-reliability/testing'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, type WorkflowDefinitionResolver, type WorkflowSnapshot, type WorkflowStore, WorkflowManager, WorkflowRegistry, WorkflowStoreContractError } from '@luckys_luis/nuxt-laravelize-workflows'
import { createWorkflowWakeHandler, TransactionalWorkflowStore, WorkflowWakeReconciler, WorkflowWakeReconciliationWorker, workflowWakeMessageType, type WorkflowWakeReconcileResult } from '../src/index.js'

type Session = { store: InMemoryWorkflowStore }

function setup() {
  const session: Session = { store: new InMemoryWorkflowStore() }
  const unitOfWork: UnitOfWork<Session> = { session, afterCommit: vi.fn(), markRollbackOnly: vi.fn() }
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
  snapshotFormatVersion: 1,
  id,
  workflowName: 'recovery',
  workflowVersion: '1',
  startKey: id,
  canonicalInput: '{}',
  input: {},
  state: 'pending',
  revision: 0,
  steps: [{ name: 'work', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: `${id}:step:0` }],
  cancellationRequested: false,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})
const recoveryResolver = () => new WorkflowRegistry().register(defineWorkflow({ name: 'recovery', version: '1', steps: [defineStep({ name: 'work', maxAttempts: 2, run: () => null })] }))

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

  it('records an immediate transition wake when cancellation merges into a retryable rejection', async () => {
    const { appended, store } = setup()
    let rejectAttempt!: (error: Error) => void
    let handlerStarted!: () => void
    const startedHandler = new Promise<void>((resolve) => {
      handlerStarted = resolve
    })
    const retrying = vi.fn(() => new Promise<never>((_resolve, reject) => {
      rejectAttempt = reject
      handlerStarted()
    }))
    const definition = defineWorkflow({ name: 'retry-race', version: '1', steps: [
      defineStep({ name: 'effect', run: () => 'receipt', compensate: () => {} }),
      defineStep({ name: 'retrying', maxAttempts: 2, run: retrying }),
    ] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'retry-race', tokenFactory: () => 'lease', clock: { now: () => 100 }, leaseDurationMs: 1_000, heartbeatIntervalMs: 900, retrySchedule: () => 50 })
    const started = await manager.start(definition, {}, 'retry-race')
    await manager.process(started.id)
    appended.length = 0
    const processing = manager.process(started.id)
    await startedHandler
    await manager.cancel(started.id)
    rejectAttempt(new Error('later'))

    await expect(processing).resolves.toMatchObject({ state: 'waiting_retry', cancellationRequested: true, steps: [{ state: 'committed' }, { state: 'waiting_retry', retryAt: 150 }] })
    expect(appended.at(-1)?.options?.availableAt).toBe(new Date(100).toISOString())
    expect(retrying).toHaveBeenCalledOnce()
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

  it('rejects a malformed create receipt before appending its wake', async () => {
    const { appended, session, store } = setup()
    const create = session.store.create.bind(session.store)
    vi.spyOn(session.store, 'create').mockImplementation(async value => ({ ...(await create(value)), snapshot: { ...value, revision: 1 } }))
    await expect(store.create(snapshot('bad-create'))).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(appended).toEqual([])
  })

  it('reads and validates a claim receipt before appending its wake', async () => {
    const { appended, session, store } = setup()
    await session.store.create(snapshot('bad-claim'))
    const claim = session.store.claim.bind(session.store)
    vi.spyOn(session.store, 'claim').mockImplementation(async (...args) => ({ ...(await claim(...args)), revision: 99 }))
    await expect(store.claim('bad-claim', 0, 'lease', 10, 100)).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(appended).toEqual([])
  })

  it('validates a commit receipt before appending its transition wake', async () => {
    const { appended, session, store } = setup()
    await session.store.create(snapshot('bad-commit'))
    const claimed = await session.store.claim('bad-commit', 0, 'lease', 10, 100)
    const candidate: WorkflowSnapshot = { ...claimed, state: 'running', updatedAt: 20, steps: [{ ...claimed.steps[0]!, state: 'running', attempts: 1 }] }
    const commit = session.store.commit.bind(session.store)
    vi.spyOn(session.store, 'commit').mockImplementation(async (...args) => ({ ...(await commit(...args)), state: 'cancelled' }))
    await expect(store.commit(candidate, claimed.revision, 'lease', 20)).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(appended).toEqual([])
  })

  it('marks a caller-owned unit of work rollback-only after a post-mutation failure', async () => {
    const { outbox, store, unitOfWork } = setup()
    const failure = new Error('outbox failed after mutation')
    outbox.appendIn.mockRejectedValueOnce(failure)

    await expect(store.in(unitOfWork).create(snapshot('rollback-only'))).rejects.toBe(failure)
    expect(unitOfWork.markRollbackOnly).toHaveBeenCalledWith(failure)
  })

  it('validates a cancellation merge using the newer authoritative updatedAt', async () => {
    const { session, store, unitOfWork } = setup()
    await session.store.create(snapshot('timestamp-race', { createdAt: 100, updatedAt: 100 }))
    const claimed = await session.store.claim('timestamp-race', 0, 'lease', 100, 300)
    await session.store.requestCancellation('timestamp-race', claimed.revision, 200)
    const candidate = { ...claimed, state: 'running' as const, updatedAt: 100, steps: [{ ...claimed.steps[0]!, state: 'running' as const, attempts: 1 }] }

    await expect(store.in(unitOfWork).commit(candidate, claimed.revision, 'lease', 100, false)).resolves.toMatchObject({ cancellationRequested: true, updatedAt: 200 })
    expect(unitOfWork.markRollbackOnly).not.toHaveBeenCalled()
  })

  it('accepts a cancellation-aware success candidate and appends its transition wake', async () => {
    const { appended, session, store, unitOfWork } = setup()
    await session.store.create(snapshot('fulfilled-after-abort', { createdAt: 100, updatedAt: 200 }))
    const claimed = await session.store.claim('fulfilled-after-abort', 0, 'lease', 100, 300)
    await session.store.requestCancellation('fulfilled-after-abort', claimed.revision, 100)
    appended.length = 0
    const candidate: WorkflowSnapshot = {
      ...claimed,
      cancellationRequested: true,
      state: 'running',
      updatedAt: 200,
      steps: [{ ...claimed.steps[0]!, state: 'committed', attempts: 1, output: { receipt: 'effect-1' } }],
    }

    const committed = await store.in(unitOfWork).commit(candidate, claimed.revision, 'lease', 100)
    expect(committed).toMatchObject({ revision: claimed.revision + 2, cancellationRequested: true, updatedAt: 200 })
    expect(appended).toEqual([expect.objectContaining({ envelope: expect.objectContaining({ payload: { workflowId: 'fulfilled-after-abort' } }) })])
  })

  it('validates wake payloads and processes one authoritative transition', async () => {
    const manager = { processResult: vi.fn(async () => ({ outcome: 'terminal' })) } as unknown as WorkflowManager
    const handler = createWorkflowWakeHandler(manager)
    const controller = new AbortController()
    await handler({ version: 1, id: 'wake', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: 'workflow-1' } }, { signal: controller.signal, leaseToken: 'lease', attempt: 1 })
    expect(manager.processResult).toHaveBeenCalledWith('workflow-1', { signal: controller.signal })
    await expect(handler({ version: 1, id: 'bad', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: '', extra: true } })).rejects.toThrow(TypeError)
  })

  it('fails a wake handler before claim when the exact definition is missing', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshot('unsupported-handler', { workflowVersion: '2' }))
    const definition = defineWorkflow({ name: 'recovery', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition))
    const claim = vi.spyOn(store, 'claim')
    const handler = createWorkflowWakeHandler(manager)

    await expect(handler({ version: 1, id: 'wake', type: workflowWakeMessageType, occurredAt: new Date(0).toISOString(), payload: { workflowId: 'unsupported-handler' } })).rejects.toMatchObject({ workflowName: 'recovery', workflowVersion: '2' })
    expect(claim).not.toHaveBeenCalled()
  })
})

describe('workflow wake reconciliation', () => {
  it('bounds duplicate wakes while allowing recovery in a later generation', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshot('bounded'))
    const outbox = new InMemoryReliabilityStore()
    let now = 150
    const reconciler = new WorkflowWakeReconciler(store, outbox, { resolver: recoveryResolver(), clock: () => now, generationMs: 100 })

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
    const reconciler = new WorkflowWakeReconciler(store, outbox, { resolver: recoveryResolver(), clock: () => 150, generationMs: 100 })

    await reconciler.reconcile(['changed'])
    await store.requestCancellation('changed', 0, 160)
    await reconciler.reconcile(['changed'])

    expect(outbox.records.size).toBe(2)
  })

  it('rejects invalid recovery generations', () => {
    const store = new InMemoryWorkflowStore()
    const outbox = new InMemoryReliabilityStore()
    expect(() => new WorkflowWakeReconciler(store, outbox, { resolver: recoveryResolver(), generationMs: 0 })).toThrow('generationMs must be an integer between 1 and 86400000')
  })

  it('fails fast when the resolver contract is absent at runtime', () => {
    const store = new InMemoryWorkflowStore()
    const outbox = new InMemoryReliabilityStore()
    expect(() => new WorkflowWakeReconciler(store, outbox, { resolver: {} as WorkflowDefinitionResolver })).toThrow('resolver must provide a resolve function')
  })

  it('schedules fresh wakes from authoritative retry and lease state', async () => {
    const store = new InMemoryWorkflowStore()
    const snapshots = [
      snapshot('pending'),
      snapshot('leased', { lease: { token: 'active', expiresAt: 150 } }),
      snapshot('expired', { lease: { token: 'expired', expiresAt: 90 } }),
      snapshot('waiting', { state: 'waiting_retry', steps: [{ name: 'work', state: 'waiting_retry', attempts: 1, compensationAttempts: 0, idempotencyKey: 'waiting:step:0', retryAt: 175, error: { name: 'Error', message: 'later' } }] }),
      snapshot('cancelled-waiting', { state: 'waiting_retry', cancellationRequested: true, steps: [{ name: 'work', state: 'waiting_retry', attempts: 1, compensationAttempts: 0, idempotencyKey: 'cancelled-waiting:step:0', retryAt: 175, error: { name: 'Error', message: 'later' } }] }),
      snapshot('elapsed', { state: 'waiting_retry', steps: [{ name: 'work', state: 'waiting_retry', attempts: 1, compensationAttempts: 0, idempotencyKey: 'elapsed:step:0', retryAt: 80, error: { name: 'Error', message: 'later' } }] }),
      snapshot('terminal', { state: 'completed', steps: [{ name: 'work', state: 'committed', attempts: 1, compensationAttempts: 0, idempotencyKey: 'terminal:step:0', output: null }] }),
    ]
    for (const value of snapshots) await store.create(value)
    const appended: Array<{ envelope: MessageEnvelope, options?: OutboxAppendOptions }> = []
    let id = 0
    const reconciler = new WorkflowWakeReconciler(store, { append: async (envelope, options) => {
      appended.push({ envelope, options })
    } }, { resolver: recoveryResolver(), clock: () => 100, idFactory: () => `recovery-${++id}` })

    const result = await reconciler.reconcile(snapshots.map(value => value.id))

    expect(result).toEqual({ scheduled: ['pending', 'leased', 'expired', 'waiting', 'cancelled-waiting', 'elapsed'], skipped: ['terminal'], failed: [] })
    expect(appended.map(item => item.options?.availableAt)).toEqual([0, 150, 90, 175, 0, 80].map(value => new Date(value).toISOString()))
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
    } }, { resolver: recoveryResolver(), clock: () => 10, idFactory: () => crypto.randomUUID() })

    const result = await reconciler.reconcileStore({ pageSize: 1 })

    expect(result.scheduled).toEqual(['one', 'three'])
    expect(result.failed).toMatchObject([{ workflowId: 'two', error: { message: 'outbox unavailable' } }])
    expect(discover.mock.calls.every(([query]) => query.updatedBefore === 10 && query.limit === 1)).toBe(true)
  })

  it('requires exact resolver output to suppress unsupported wakes and continue', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshot('unsupported', { workflowVersion: '2' }))
    await store.create(snapshot('missing', { workflowVersion: '3' }))
    await store.create(snapshot('supported'))
    const definition = defineWorkflow({ name: 'recovery', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })
    const outbox = { append: vi.fn(async (_envelope: MessageEnvelope) => {}) }
    const registry = new WorkflowRegistry().register(definition)
    const reconciler = new WorkflowWakeReconciler(store, outbox, { resolver: { resolve: reference => reference.version === '2' ? definition : registry.resolve(reference) }, clock: () => 100 })

    const result = await reconciler.reconcile(['unsupported', 'missing', 'supported'])

    expect(result.scheduled).toEqual(['supported'])
    expect(result.failed).toMatchObject([
      { workflowId: 'unsupported', error: { requested: { name: 'recovery', version: '2' }, resolvedName: 'recovery', resolvedVersion: '1' } },
      { workflowId: 'missing', error: { workflowName: 'recovery', workflowVersion: '3' } },
    ])
    expect(outbox.append).toHaveBeenCalledOnce()
    expect(vi.mocked(outbox.append).mock.calls[0]![0].payload).toEqual({ workflowId: 'supported' })
  })

  it('suppresses poison rows with mismatched definition steps and continues', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshot('poison', { steps: [{ name: 'other', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'poison:step:0' }] }))
    await store.create(snapshot('supported'))
    const outbox = { append: vi.fn(async () => {}) }
    const reconciler = new WorkflowWakeReconciler(store, outbox, { resolver: recoveryResolver(), clock: () => 100 })

    const result = await reconciler.reconcile(['poison', 'supported'])

    expect(result.scheduled).toEqual(['supported'])
    expect(result.failed).toMatchObject([{ workflowId: 'poison', error: { name: 'WorkflowIdentityConflictError' } }])
    expect(outbox.append).toHaveBeenCalledOnce()
  })

  it('reports missing IDs and requires recovery discovery for store scans', async () => {
    const store = new InMemoryWorkflowStore()
    const outbox = { append: vi.fn(async () => {}) }
    const reconciler = new WorkflowWakeReconciler(store, outbox, { resolver: recoveryResolver() })
    expect(await reconciler.reconcile(['missing'])).toMatchObject({ failed: [{ workflowId: 'missing', error: { message: 'Workflow not found: missing' } }] })
    const basicStore: WorkflowStore = {
      create: value => store.create(value),
      get: id => store.get(id),
      claim: (...args) => store.claim(...args),
      renewLease: (...args) => store.renewLease(...args),
      commit: (...args) => store.commit(...args),
      requestCancellation: (...args) => store.requestCancellation(...args),
    }
    await expect(new WorkflowWakeReconciler(basicStore, outbox, { resolver: recoveryResolver() }).reconcileStore()).rejects.toThrow('does not support recovery discovery')
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

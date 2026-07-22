/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it, vi } from 'vitest'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, LeaseConflictError, RevisionConflictError, StartKeyConflictError, WorkflowExecutionAbortedError, WorkflowLeaseLostError, WorkflowManager, WorkflowRegistry } from '../src'
import type { Clock, WorkflowSnapshot, WorkflowStore } from '../src'

class FakeClock implements Clock {
  constructor(public time = 0) {}
  now() { return this.time }
}

function setup(steps: ReturnType<typeof defineStep>[], options: { clock?: FakeClock, ids?: string[], leaseDurationMs?: number, heartbeatIntervalMs?: number } = {}) {
  const workflow = defineWorkflow({ name: 'order', version: '1', steps })
  const registry = new WorkflowRegistry().register(workflow)
  const store = new InMemoryWorkflowStore()
  const ids = options.ids ?? ['workflow-1']
  let token = 0
  const manager = new WorkflowManager(store, registry, {
    clock: options.clock,
    retrySchedule: () => 10,
    idFactory: () => ids.shift() ?? 'unused-id',
    tokenFactory: () => `lease-${++token}`,
    leaseDurationMs: options.leaseDurationMs,
    heartbeatIntervalMs: options.heartbeatIntervalMs,
  })
  return { workflow, registry, store, manager }
}

describe('WorkflowManager', () => {
  it('discovers recoverable workflows with bounded cursor pagination', async () => {
    const store = new InMemoryWorkflowStore()
    await Promise.all([
      store.create(snapshotFixture({ id: 'b', startKey: 'b', updatedAt: 10 })),
      store.create(snapshotFixture({ id: 'a', startKey: 'a', updatedAt: 10 })),
      store.create(snapshotFixture({ id: 'later', startKey: 'later', updatedAt: 21 })),
      store.create(snapshotFixture({ id: 'done', startKey: 'done', state: 'completed', updatedAt: 5 })),
    ])
    const first = await store.discoverRecoverable({ updatedBefore: 20, limit: 1 })
    expect(first).toEqual({ workflowIds: ['a'], nextCursor: { updatedAt: 10, id: 'a' } })
    await expect(store.discoverRecoverable({ updatedBefore: 20, limit: 1, cursor: first.nextCursor })).resolves.toEqual({ workflowIds: ['b'], nextCursor: { updatedAt: 10, id: 'b' } })
    await expect(store.discoverRecoverable({ updatedBefore: 20, limit: 0 })).rejects.toThrow(TypeError)
  })

  it('rechecks terminal state between recovery pages', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshotFixture({ id: 'a', startKey: 'a', updatedAt: 10 }))
    await store.create(snapshotFixture({ id: 'b', startKey: 'b', updatedAt: 10 }))
    const first = await store.discoverRecoverable({ updatedBefore: 20, limit: 1 })
    const claimed = await store.claim('b', 0, 'lease', 10, 30)
    await store.commit({ ...claimed, state: 'completed', updatedAt: 15 }, claimed.revision, 'lease', 10)
    await expect(store.discoverRecoverable({ updatedBefore: 20, limit: 1, cursor: first.nextCursor })).resolves.toEqual({ workflowIds: [] })
  })

  it('persists linear progression and stable step keys', async () => {
    const calls: string[] = []
    const { manager, workflow } = setup([
      defineStep({ name: 'first', run: (context) => { calls.push(context.idempotencyKey); return { value: 1 } } }),
      defineStep({ name: 'second', run: (context) => { expect(context.previousOutput).toEqual({ value: 1 }); calls.push(context.idempotencyKey); return null } }),
    ])
    const started = await manager.start(workflow, { order: 1 }, 'order-1')
    const done = await manager.run(started.id)
    expect(done.state).toBe('completed')
    expect(done.steps.map(step => step.attempts)).toEqual([1, 1])
    expect(calls).toEqual(['workflow-1:step:0', 'workflow-1:step:1'])
  })

  it('resumes with a new manager after every committed step', async () => {
    const calls: string[] = []
    const { manager, workflow, store, registry } = setup([
      defineStep({ name: 'one', run: () => { calls.push('one'); return 1 } }),
      defineStep({ name: 'two', run: () => { calls.push('two'); return 2 } }),
    ])
    const started = await manager.start(workflow, {}, 'restart')
    expect((await manager.process(started.id)).steps[0]?.state).toBe('committed')
    const restarted = new WorkflowManager(store, registry, { idFactory: () => 'x', tokenFactory: () => 'restart-token' })
    expect((await restarted.run(started.id)).state).toBe('completed')
    expect(calls).toEqual(['one', 'two'])
  })

  it('rebinds a store without losing manager factories or registry', async () => {
    const clock = new FakeClock(42)
    const { manager, workflow } = setup([defineStep({ name: 'one', run: () => null })], { clock, ids: ['configured-id'] })
    const reboundStore = new InMemoryWorkflowStore()
    const started = await manager.using(reboundStore).start(workflow, {}, 'rebound')
    expect(started).toMatchObject({ id: 'configured-id', createdAt: 42 })
    expect(await reboundStore.get(started.id)).toEqual(started)
  })

  it('waits for deterministic retry deadlines and persists attempts', async () => {
    const clock = new FakeClock(100)
    const run = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue('ok')
    const { manager, workflow } = setup([defineStep({ name: 'retry', maxAttempts: 2, run })], { clock })
    const started = await manager.start(workflow, null, 'retry')
    const waiting = await manager.process(started.id)
    expect(waiting.state).toBe('waiting_retry')
    expect(waiting.steps[0]).toMatchObject({ attempts: 1, retryAt: 110 })
    expect((await manager.process(started.id)).revision).toBe(waiting.revision)
    clock.time = 110
    const done = await manager.process(started.id)
    expect(done).toMatchObject({ state: 'running', steps: [{ attempts: 2, state: 'committed' }] })
    expect((await manager.process(started.id)).state).toBe('completed')
  })

  it('reports terminal, waiting, processed, and contended outcomes', async () => {
    const clock = new FakeClock(100)
    const { manager, workflow, store } = setup([defineStep({ name: 'retry', maxAttempts: 2, run: () => { throw new Error('later') } })], { clock })
    const started = await manager.start(workflow, {}, 'outcomes')
    expect((await manager.processResult(started.id)).outcome).toBe('processed')
    expect(await manager.processResult(started.id)).toMatchObject({ outcome: 'waiting', retryAt: 110 })
    clock.time = 110
    await manager.processResult(started.id)
    expect((await manager.processResult(started.id)).outcome).toBe('terminal')

    const other = await manager.start(workflow, {}, 'contended')
    await store.claim(other.id, other.revision, 'other-worker', clock.time, clock.time + 100)
    expect((await manager.processResult(other.id)).outcome).toBe('contended')
  })

  it.each([
    ['terminal', { state: 'completed' }, { outcome: 'terminal' }],
    ['waiting', { state: 'waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', retryAt: 321 }] }, { outcome: 'waiting', retryAt: 321 }],
    ['contended', { state: 'running' }, { outcome: 'contended' }],
  ] as const)('classifies an authoritative %s snapshot after a claim race', async (_label, change, expected) => {
    const observed = snapshotFixture()
    const authoritative = { ...observed, ...change, revision: 1 } as WorkflowSnapshot
    let reads = 0
    const store: WorkflowStore = {
      get: async () => reads++ === 0 ? observed : authoritative,
      claim: async () => { throw new RevisionConflictError() },
      renewLease: async () => { throw new Error('unused') },
      create: async () => { throw new Error('unused') },
      commit: async () => { throw new Error('unused') },
      requestCancellation: async () => { throw new Error('unused') },
    }
    const manager = new WorkflowManager(store, new WorkflowRegistry())
    expect(await manager.processResult(observed.id)).toMatchObject(expected)
  })

  it('deduplicates canonical input and conflicts on changed input', async () => {
    const { manager, workflow } = setup([defineStep({ name: 'one', run: () => null })], { ids: ['first', 'second', 'third'] })
    const first = await manager.start(workflow, { b: 2, a: 1 }, 'same')
    const duplicate = await manager.start(workflow, { a: 1, b: 2 }, 'same')
    expect(duplicate.id).toBe(first.id)
    await expect(manager.start(workflow, { a: 9, b: 2 }, 'same')).rejects.toBeInstanceOf(StartKeyConflictError)
  })

  it('rejects runtime values that are not JSON-safe', async () => {
    const { manager, workflow } = setup([defineStep({ name: 'one', run: () => null })])
    await expect(manager.start(workflow, { amount: Number.NaN }, 'invalid')).rejects.toThrow('finite JSON numbers')
  })

  it('fences a stale lease token', async () => {
    const store = new InMemoryWorkflowStore()
    const snapshot = snapshotFixture()
    await store.create(snapshot)
    const first = await store.claim(snapshot.id, 0, 'old', 0, 5)
    const second = await store.claim(snapshot.id, first.revision, 'new', 5, 10)
    await expect(store.commit(first, second.revision, 'old', 5)).rejects.toBeInstanceOf(LeaseConflictError)
  })

  it('rejects a commit when its otherwise valid lease has expired', async () => {
    const store = new InMemoryWorkflowStore()
    const snapshot = snapshotFixture()
    await store.create(snapshot)
    const claimed = await store.claim(snapshot.id, 0, 'lease', 0, 5)
    await expect(store.commit(claimed, claimed.revision, 'lease', 5)).rejects.toBeInstanceOf(LeaseConflictError)
  })

  it('renews only lease expiration and accepts a cancellation revision race', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshotFixture())
    const claimed = await store.claim('id', 0, 'lease', 0, 10)
    const renewed = await store.renewLease('id', claimed.revision, 'lease', 1, 20)
    expect(renewed).toMatchObject({ revision: claimed.revision, updatedAt: claimed.updatedAt, lease: { token: 'lease', expiresAt: 20 } })
    const cancelled = await store.requestCancellation('id', renewed.revision, 2)
    const afterCancellation = await store.renewLease('id', renewed.revision, 'lease', 3, 30)
    expect(afterCancellation).toMatchObject({ revision: cancelled.revision, cancellationRequested: true, lease: { expiresAt: 30 } })
    await expect(store.renewLease('id', renewed.revision, 'other', 3, 40)).rejects.toBeInstanceOf(LeaseConflictError)
  })

  it('heartbeats long handlers without workflow revision churn', async () => {
    let contextSignal: AbortSignal | undefined
    const { manager, workflow, store } = setup([defineStep({ name: 'long', run: async (context) => {
      contextSignal = context.signal
      await new Promise(resolve => setTimeout(resolve, 35))
      return 'done'
    } })], { leaseDurationMs: 60, heartbeatIntervalMs: 10 })
    const renew = vi.spyOn(store, 'renewLease')
    const started = await manager.start(workflow, {}, 'heartbeat')
    const processed = await manager.process(started.id)
    expect(contextSignal).toBeInstanceOf(AbortSignal)
    expect(renew.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(processed.revision).toBe(3)
  })

  it('observes active cancellation through heartbeat without scheduling a business retry', async () => {
    let startedHandler!: () => void
    const handlerStarted = new Promise<void>((resolve) => { startedHandler = resolve })
    const { manager, workflow } = setup([defineStep({ name: 'long', maxAttempts: 3, run: async ({ signal }) => {
      startedHandler()
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      return null
    } })], { leaseDurationMs: 100, heartbeatIntervalMs: 10 })
    const started = await manager.start(workflow, {}, 'cancel-active')
    const processing = manager.process(started.id)
    await handlerStarted
    await manager.cancel(started.id)
    const cancelled = await processing
    expect(cancelled).toMatchObject({ state: 'cancelled', cancellationRequested: true, steps: [{ state: 'pending', attempts: 1 }] })
  })

  it('aborts on caller shutdown without committing a business failure', async () => {
    let startedHandler!: () => void
    const handlerStarted = new Promise<void>((resolve) => { startedHandler = resolve })
    const { manager, workflow } = setup([defineStep({ name: 'long', maxAttempts: 3, run: async ({ signal }) => {
      startedHandler()
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      return null
    } })], { leaseDurationMs: 100, heartbeatIntervalMs: 10 })
    const started = await manager.start(workflow, {}, 'shutdown')
    const controller = new AbortController()
    const processing = manager.process(started.id, { signal: controller.signal })
    await handlerStarted
    controller.abort()
    await expect(processing).rejects.toBeInstanceOf(WorkflowExecutionAbortedError)
    expect(await manager.status(started.id)).toMatchObject({ state: 'running', steps: [{ state: 'running' }] })
  })

  it('does not claim or consume an attempt for an already-aborted caller', async () => {
    const { manager, workflow } = setup([defineStep({ name: 'never', run: () => null })])
    const started = await manager.start(workflow, {}, 'already-aborted')
    const controller = new AbortController()
    controller.abort()
    await expect(manager.process(started.id, { signal: controller.signal })).rejects.toBeInstanceOf(WorkflowExecutionAbortedError)
    expect(await manager.status(started.id)).toEqual(started)
  })

  it.each([WorkflowLeaseLostError, WorkflowExecutionAbortedError])('treats handler-thrown %s as a business failure', async (ErrorType) => {
    const { manager, workflow } = setup([defineStep({ name: 'business', run: () => { throw new ErrorType() } })])
    const started = await manager.start(workflow, {}, ErrorType.name)
    const failed = await manager.process(started.id)
    expect(failed).toMatchObject({ state: 'failed', steps: [{ state: 'failed', error: { name: ErrorType.name } }] })
  })

  it('rejects a renewal that completes after its proposed expiration', async () => {
    const clock = new FakeClock(0)
    let release!: () => void
    const renewalBlocked = new Promise<void>((resolve) => { release = resolve })
    const { manager, workflow, store } = setup([defineStep({ name: 'slow-renewal', run: async ({ signal }) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return null
    } })], { clock, leaseDurationMs: 20, heartbeatIntervalMs: 5 })
    const realRenew = store.renewLease.bind(store)
    vi.spyOn(store, 'renewLease').mockImplementation(async (...args) => {
      await renewalBlocked
      return realRenew(...args)
    })
    const started = await manager.start(workflow, {}, 'late-renewal')
    const processing = manager.process(started.id)
    await new Promise(resolve => setTimeout(resolve, 8))
    clock.time = 25
    release()
    await expect(processing).rejects.toBeInstanceOf(WorkflowLeaseLostError)
  })

  it('discards handler completion after heartbeat lease loss', async () => {
    const { manager, workflow, store } = setup([defineStep({ name: 'long', run: async ({ signal }) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return 'must-not-commit'
    } })], { leaseDurationMs: 100, heartbeatIntervalMs: 10 })
    vi.spyOn(store, 'renewLease').mockRejectedValue(new LeaseConflictError())
    const started = await manager.start(workflow, {}, 'lease-loss')
    await expect(manager.process(started.id)).rejects.toBeInstanceOf(WorkflowLeaseLostError)
    const authoritative = await store.get(started.id)
    expect(authoritative).toMatchObject({ state: 'running', steps: [{ state: 'running' }] })
    expect(authoritative!.steps[0]).not.toHaveProperty('output')
  })

  it('uses only the registered definition when a same-name reference differs', async () => {
    const registeredRun = vi.fn(() => null)
    const { manager, workflow } = setup([defineStep({ name: 'registered', run: registeredRun })])
    const impostor = defineWorkflow({ name: workflow.name, version: workflow.version, steps: [defineStep({ name: 'impostor', run: () => null })] })
    const started = await manager.start(impostor, {}, 'authority')
    expect(started.steps[0]?.name).toBe('registered')
    await manager.run(started.id)
    expect(registeredRun).toHaveBeenCalledOnce()
  })

  it('persists attempt start and consumes an interrupted attempt after lease expiry', async () => {
    const clock = new FakeClock()
    const run = vi.fn(() => null)
    const { manager, workflow, store } = setup([defineStep({ name: 'work', maxAttempts: 2, run })], { clock })
    const started = await manager.start(workflow, {}, 'crash')
    const claimed = await store.claim(started.id, started.revision, 'crashed-worker', 0, 5)
    const steps = claimed.steps.map(step => ({ ...step }))
    steps[0]!.state = 'running'; steps[0]!.attempts = 1
    await store.commit({ ...claimed, state: 'running', steps }, claimed.revision, 'crashed-worker', 0, false)
    clock.time = 5
    const interrupted = await manager.process(started.id)
    expect(interrupted).toMatchObject({ state: 'waiting_retry', steps: [{ attempts: 1, state: 'waiting_retry' }] })
    expect(run).not.toHaveBeenCalled()
    clock.time = 15
    const done = await manager.process(started.id)
    expect(done).toMatchObject({ state: 'running', steps: [{ attempts: 2, state: 'committed' }] })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2, idempotencyKey: 'workflow-1:step:0' }))
  })

  it('rejects invalid handler output instead of persisting success', async () => {
    const { manager, workflow } = setup([defineStep({ name: 'invalid', run: () => Number.NaN as never })])
    const started = await manager.start(workflow, {}, 'invalid-output')
    const failed = await manager.process(started.id)
    expect(failed.state).toBe('failed')
    expect(failed.steps[0]).toMatchObject({ state: 'failed', error: { name: 'TypeError' } })
    expect(failed.steps[0]).not.toHaveProperty('output')
  })

  it.each([
    ['undefined', undefined],
    ['non-plain object', new Date(0)],
  ])('rejects %s handler output at runtime', async (_label, output) => {
    const { manager, workflow } = setup([defineStep({ name: 'invalid', run: () => output as never })])
    const started = await manager.start(workflow, {}, `invalid-${_label}`)
    const failed = await manager.process(started.id)
    expect(failed.steps[0]).toMatchObject({ state: 'failed', error: { name: 'TypeError' } })
  })

  it('compensates committed steps in reverse order after failure', async () => {
    const compensated: string[] = []
    const { manager, workflow } = setup([
      defineStep({ name: 'one', run: () => 1, compensate: (context) => { compensated.push(`${context.stepOutput}:${context.idempotencyKey}`) } }),
      defineStep({ name: 'two', run: () => 2, compensate: (context) => { compensated.push(`${context.stepOutput}:${context.idempotencyKey}`) } }),
      defineStep({ name: 'fail', run: () => { throw new Error('fatal') } }),
    ])
    const started = await manager.start(workflow, {}, 'compensate')
    const done = await manager.run(started.id)
    expect(done.state).toBe('compensated')
    expect(compensated).toEqual(['2:workflow-1:compensate:1', '1:workflow-1:compensate:0'])
  })

  it('resumes compensation retries and records terminal compensation failure', async () => {
    const clock = new FakeClock()
    const compensate = vi.fn().mockRejectedValue(new Error('refund unavailable'))
    const { manager, workflow, store, registry } = setup([
      defineStep({ name: 'commit', maxAttempts: 2, run: () => 'charged', compensate }),
      defineStep({ name: 'fail', run: () => { throw new Error('stop') } }),
    ], { clock })
    const started = await manager.start(workflow, {}, 'compensation-retry')
    await manager.process(started.id)
    await manager.process(started.id)
    const waiting = await manager.process(started.id)
    expect(waiting.state).toBe('compensation_waiting_retry')
    const restarted = new WorkflowManager(store, registry, { clock, retrySchedule: () => 10, tokenFactory: () => 'restart' })
    clock.time = 10
    const failed = await restarted.process(started.id)
    expect(failed.state).toBe('compensation_failed')
    expect(failed.steps[0]).toMatchObject({ compensationAttempts: 2, state: 'compensation_failed' })
  })

  it('consumes an interrupted compensation attempt before retrying with its stable key', async () => {
    const clock = new FakeClock()
    const compensate = vi.fn()
    const { manager, workflow, store } = setup([
      defineStep({ name: 'commit', maxAttempts: 2, run: () => 'effect', compensate }),
      defineStep({ name: 'fail', run: () => { throw new Error('stop') } }),
    ], { clock })
    const started = await manager.start(workflow, {}, 'compensation-crash')
    await manager.process(started.id)
    const compensating = await manager.process(started.id)
    const claimed = await store.claim(started.id, compensating.revision, 'crashed-compensator', 0, 5)
    const steps = claimed.steps.map(step => ({ ...step }))
    steps[0]!.state = 'compensating'; steps[0]!.compensationAttempts = 1
    await store.commit({ ...claimed, steps }, claimed.revision, 'crashed-compensator', 0, false)
    clock.time = 5
    const interrupted = await manager.process(started.id)
    expect(interrupted.steps[0]).toMatchObject({ state: 'compensation_waiting_retry', compensationAttempts: 1 })
    expect(compensate).not.toHaveBeenCalled()
    clock.time = 15
    await manager.process(started.id)
    expect(compensate).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2, idempotencyKey: 'workflow-1:compensate:0' }))
    expect((await manager.process(started.id)).state).toBe('compensated')
  })

  it('cancels between attempts and compensates committed work', async () => {
    const compensation = vi.fn()
    const { manager, workflow } = setup([
      defineStep({ name: 'done', run: () => true, compensate: compensation }),
      defineStep({ name: 'not-run', run: () => null }),
    ])
    const started = await manager.start(workflow, {}, 'cancel')
    await manager.process(started.id)
    await manager.cancel(started.id)
    const done = await manager.run(started.id)
    expect(done.state).toBe('cancelled')
    expect(compensation).toHaveBeenCalledOnce()
    expect(done.steps[1]?.attempts).toBe(0)
  })

  it('records cancellation racing an in-flight success and compensates its committed output', async () => {
    let release!: (value: { chargeId: string }) => void
    const effect = new Promise<{ chargeId: string }>((resolve) => { release = resolve })
    const compensate = vi.fn()
    const { manager, workflow } = setup([defineStep({ name: 'charge', run: () => effect, compensate })])
    const started = await manager.start(workflow, {}, 'in-flight-cancel')
    const processing = manager.process(started.id)
    await vi.waitFor(async () => expect((await manager.status(started.id))?.steps[0]?.state).toBe('running'))
    await manager.cancel(started.id)
    release({ chargeId: 'charge-1' })
    const committed = await processing
    expect(committed).toMatchObject({ cancellationRequested: true, steps: [{ state: 'committed', output: { chargeId: 'charge-1' } }] })
    const cancelled = await manager.run(started.id)
    expect(cancelled.state).toBe('cancelled')
    expect(compensate).toHaveBeenCalledWith(expect.objectContaining({ stepOutput: { chargeId: 'charge-1' } }))
  })
})

function snapshotFixture(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return {
    id: 'id', workflowName: 'name', workflowVersion: '1', startKey: 'key', canonicalInput: '{}', input: {}, state: 'pending', revision: 0,
    cancellationRequested: false, createdAt: 0, updatedAt: 0,
    steps: [{ name: 'one', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'id:step:0' }],
    ...overrides,
  }
}

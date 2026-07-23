/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it, vi } from 'vitest'
import { assertWorkflowCommitReceipt, assertWorkflowRenewLeaseReceipt, assertWorkflowSnapshot, defineStep, defineWorkflow, DuplicateWorkflowDefinitionError, InMemoryWorkflowStore, InvalidWorkflowSnapshotError, InvalidWorkflowVersionError, LeaseConflictError, normalizePersistedWorkflowSnapshot, RevisionConflictError, StartKeyConflictError, UnsupportedWorkflowSnapshotFormatError, workflowNextRetryAt, WorkflowDefinitionNotFoundError, WorkflowExecutionAbortedError, WorkflowIdentityConflictError, WorkflowLeaseLostError, WorkflowManager, WorkflowRegistry, WorkflowResolverContractError, WorkflowStoreContractError } from '../src'
import type { Clock, CompensationContext, WorkflowSnapshot, WorkflowStore } from '../src'

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
      store.create(completedSnapshot({ id: 'done', startKey: 'done', updatedAt: 5 })),
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
    await store.commit({ ...claimed, state: 'completed', updatedAt: 15, steps: [{ ...claimed.steps[0]!, state: 'committed', attempts: 1, output: null }] }, claimed.revision, 'lease', 10)
    await expect(store.discoverRecoverable({ updatedBefore: 20, limit: 1, cursor: first.nextCursor })).resolves.toEqual({ workflowIds: [] })
  })

  it('does not regress updatedAt when a worker commit merges a newer cancellation', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshotFixture({ createdAt: 100, updatedAt: 100 }))
    const claimed = await store.claim('id', 0, 'lease', 100, 300)
    await store.requestCancellation('id', claimed.revision, 200)
    const candidate = { ...claimed, state: 'running' as const, updatedAt: 100, steps: [{ ...claimed.steps[0]!, state: 'running' as const, attempts: 1 }] }

    await expect(store.commit(candidate, claimed.revision, 'lease', 100, false)).resolves.toMatchObject({ cancellationRequested: true, updatedAt: 200 })
  })

  it('keeps claim, cancellation, and recovery cursors monotonic across skewed managers', async () => {
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'work', run: () => 'done' })] })
    const registry = new WorkflowRegistry().register(definition)
    const store = new InMemoryWorkflowStore()
    const fast = new WorkflowManager(store, registry, { idFactory: () => 'clock-skew', clock: { now: () => 200 } })
    const slow = new WorkflowManager(store, registry, { tokenFactory: () => 'slow-lease', clock: { now: () => 100 } })
    const started = await fast.start(definition, {}, 'clock-skew')

    const processed = await slow.process(started.id)
    expect(processed).toMatchObject({ updatedAt: 200, steps: [{ state: 'committed', output: 'done' }] })
    const page = await store.discoverRecoverable({ updatedBefore: 200, limit: 1 })
    expect(page.nextCursor).toEqual({ updatedAt: 200, id: started.id })
    const cancelled = await slow.cancel(started.id)
    expect(cancelled).toMatchObject({ cancellationRequested: true, updatedAt: 200 })
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
    ['terminal', { state: 'completed', steps: completedSnapshot().steps }, { outcome: 'terminal' }],
    ['waiting', { state: 'waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 321, error: { name: 'Error', message: 'later' } }] }, { outcome: 'waiting', retryAt: 321 }],
    ['cancelled forward retry', { state: 'waiting_retry', cancellationRequested: true, steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 321, error: { name: 'Error', message: 'later' } }] }, { outcome: 'contended' }],
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
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', maxAttempts: 2, run: () => null })] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition))
    expect(await manager.processResult(observed.id)).toMatchObject(expected)
  })

  it('deduplicates canonical input and conflicts on changed input', async () => {
    const { manager, workflow } = setup([defineStep({ name: 'one', run: () => null })], { ids: ['first', 'second', 'third'] })
    const first = await manager.start(workflow, { b: 2, a: 1 }, 'same')
    const duplicate = await manager.start(workflow, { a: 1, b: 2 }, 'same')
    expect(duplicate.id).toBe(first.id)
    await expect(manager.start(workflow, { a: 9, b: 2 }, 'same')).rejects.toBeInstanceOf(StartKeyConflictError)
  })

  it('preserves own __proto__ JSON properties without mutating prototypes', async () => {
    const input = JSON.parse('{"__proto__":{"input":true},"nested":{"__proto__":{"nested":true}}}')
    const output = JSON.parse('{"__proto__":{"output":true},"nested":{"__proto__":{"nestedOutput":true}}}')
    const compensate = vi.fn(({ stepOutput }) => {
      expect(Object.getPrototypeOf(stepOutput)).toBe(Object.prototype)
      expect(Object.hasOwn(stepOutput as object, '__proto__')).toBe(true)
      expect(stepOutput).toEqual(output)
    })
    const { manager, workflow } = setup([
      defineStep({ name: 'effect', run: () => output, compensate }),
      defineStep({ name: 'failure', run: () => { throw new Error('fail') } }),
    ])
    const started = await manager.start(workflow, input, 'proto')
    expect(Object.getPrototypeOf(started.input)).toBe(Object.prototype)
    expect(Object.hasOwn(started.input as object, '__proto__')).toBe(true)
    expect(Object.hasOwn((started.input as Record<string, object>).nested!, '__proto__')).toBe(true)
    await manager.run(started.id)
    expect(compensate).toHaveBeenCalledOnce()
    expect(({} as Record<string, unknown>).input).toBeUndefined()
    expect(({} as Record<string, unknown>).output).toBeUndefined()
  })

  it('rejects unsafe maxAttempts in direct and resolver-provided definitions', () => {
    const unsafe = Number.MAX_SAFE_INTEGER + 1
    expect(() => defineStep({ name: 'one', maxAttempts: unsafe, run: () => null })).toThrow('maxAttempts must be a positive safe integer')
    const resolver = { resolve: () => ({ name: 'name', version: '1', steps: [{ name: 'one', maxAttempts: unsafe, run: () => null }] }) }
    expect(() => new WorkflowRegistry().register(resolver.resolve())).toThrow('maxAttempts must be a positive safe integer')
  })

  it('accepts a valid idempotent create result with its existing mutable state and identity', async () => {
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const existing = snapshotFixture({
      id: 'existing-id', workflowName: 'order', startKey: 'same', canonicalInput: '{"a":1}', input: { a: 1 },
      state: 'running', revision: 7, createdAt: 10, updatedAt: 20,
      steps: [{ name: 'one', state: 'running', attempts: 1, compensationAttempts: 0, idempotencyKey: 'existing-id:step:0' }],
    })
    const store = { create: vi.fn(async () => ({ snapshot: existing, created: false })) } as unknown as WorkflowStore
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'new-id', clock: { now: () => 99 } })

    await expect(manager.start(definition, { a: 1 }, 'same')).resolves.toBe(existing)
  })

  it.each([true, false])('rejects untrusted created=%s store results with a different tuple, input, or steps', async (created) => {
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const registry = new WorkflowRegistry().register(definition)
    const valid = snapshotFixture({ id: created ? 'new-id' : 'existing-id', workflowName: 'order', startKey: 'same', canonicalInput: '{"a":1}', input: { a: 1 }, createdAt: created ? 99 : 10,
      steps: [{ name: 'one', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: `${created ? 'new-id' : 'existing-id'}:step:0` }] })
    const altered = [
      { ...valid, workflowVersion: '2' },
      { ...valid, input: { a: 2 } },
      { ...valid, canonicalInput: '{"a":2}' },
      { ...valid, steps: [{ ...valid.steps[0]!, name: 'other' }] },
      { ...valid, steps: [{ ...valid.steps[0]!, idempotencyKey: 'attacker:key' }] },
    ]
    for (const snapshot of altered) {
      const store = { create: vi.fn(async () => ({ snapshot, created })) } as unknown as WorkflowStore
      const manager = new WorkflowManager(store, registry, { idFactory: () => 'new-id', clock: { now: () => 99 } })
      await expect(manager.start(definition, { a: 1 }, 'same')).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
    }
  })

  it.each([true, false])('rejects an unsupported store snapshot format for created=%s', async (created) => {
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const returned = snapshotFixture({ snapshotFormatVersion: 2 as never })
    const store = { create: vi.fn(async () => ({ snapshot: returned, created })) } as unknown as WorkflowStore
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition))

    await expect(manager.start(definition, {}, 'same')).rejects.toBeInstanceOf(WorkflowStoreContractError)
  })

  it.each([
    ['generated ID', { id: 'substituted-id', key: 'substituted-id:step:0' }],
    ['creation time', { createdAt: 100 }],
    ['generated step key', { key: 'attacker:key' }],
  ])('requires a newly-created store result to retain its %s', async (_label, alteration) => {
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const id = 'id' in alteration ? alteration.id : 'new-id'
    const createdAt = 'createdAt' in alteration ? alteration.createdAt : 99
    const key = 'key' in alteration ? alteration.key : `${id}:step:0`
    const returned = snapshotFixture({ id, workflowName: 'order', startKey: 'same', createdAt,
      steps: [{ name: 'one', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: key }] })
    const store = { create: vi.fn(async () => ({ snapshot: returned, created: true })) } as unknown as WorkflowStore
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'new-id', clock: { now: () => 99 } })

    await expect(manager.start(definition, {}, 'same')).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
  })

  it.each([
    ['state', (value: WorkflowSnapshot) => ({ ...value, state: 'running' as const, steps: [{ ...value.steps[0]!, state: 'running' as const, attempts: 1 }] })],
    ['revision', (value: WorkflowSnapshot) => ({ ...value, revision: 1 })],
    ['attempt', (value: WorkflowSnapshot) => ({ ...value, state: 'running' as const, steps: [{ ...value.steps[0]!, state: 'running' as const, attempts: 1 }] })],
    ['output', (value: WorkflowSnapshot) => ({ ...value, state: 'running' as const, steps: [{ ...value.steps[0]!, state: 'committed' as const, attempts: 1, output: 'forged' }] })],
    ['lease', (value: WorkflowSnapshot) => ({ ...value, lease: { token: 'forged', expiresAt: 1000 } })],
  ])('requires created=true to preserve the exact requested %s', async (_label, alter) => {
    const definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const requested = snapshotFixture({ id: 'new-id', workflowName: 'order', startKey: 'same', createdAt: 99, updatedAt: 99,
      steps: [{ name: 'one', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'new-id:step:0' }] })
    const store = { create: vi.fn(async () => ({ snapshot: alter(requested), created: true })) } as unknown as WorkflowStore
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => 'new-id', clock: { now: () => 99 } })
    await expect(manager.start(definition, {}, 'same')).rejects.toBeInstanceOf(WorkflowStoreContractError)
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

  it('never shortens a lease when a renewing worker clock moves backward', async () => {
    const store = new InMemoryWorkflowStore()
    await store.create(snapshotFixture())
    const claimed = await store.claim('id', 0, 'lease', 100, 1_000)

    await expect(store.renewLease('id', claimed.revision, 'lease', 50, 500)).resolves.toMatchObject({ lease: { token: 'lease', expiresAt: 1_000 } })
    await expect(store.claim('id', claimed.revision, 'other', 500, 1_500)).rejects.toBeInstanceOf(LeaseConflictError)
    await expect(store.claim('id', claimed.revision, 'other', 1_000, 1_500)).resolves.toMatchObject({ lease: { token: 'other', expiresAt: 1_500 } })
  })

  it('validates renewal and failed-commit receipts against authoritative cancellation and lease state', () => {
    const observed = snapshotFixture({ revision: 1, lease: { token: 'lease', expiresAt: 1_000 } })
    expect(assertWorkflowRenewLeaseReceipt(observed, observed, 1, 'lease', 50, 500).lease?.expiresAt).toBe(1_000)
    expect(() => assertWorkflowRenewLeaseReceipt(observed, { ...observed, lease: { token: 'lease', expiresAt: 500 } }, 1, 'lease', 50, 500)).toThrow(WorkflowStoreContractError)

    const runningStep = { ...observed.steps[0]!, state: 'running' as const, attempts: 1 }
    const authoritative = { ...observed, revision: 2, state: 'running' as const, steps: [runningStep], cancellationRequested: true, updatedAt: 200 }
    const failedStep = { ...runningStep, state: 'failed' as const, error: { name: 'Error', message: 'failed' } }
    const candidate = { ...observed, state: 'failed' as const, steps: [failedStep], updatedAt: 200 }
    const merged = { ...candidate, revision: 3, cancellationRequested: true, lease: undefined }
    expect(() => assertWorkflowCommitReceipt(authoritative, candidate, merged, 'lease', 200, true, 1)).toThrow(WorkflowStoreContractError)
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

  it('accepts a monotonic cancellation timestamp newer than a skewed heartbeat clock', async () => {
    let handlerStarted!: () => void
    const startedHandler = new Promise<void>((resolve) => { handlerStarted = resolve })
    const definition = defineWorkflow({ name: 'clocked', version: '1', steps: [defineStep({ name: 'long', run: async ({ signal }) => {
      handlerStarted()
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
      return null
    } })] })
    const registry = new WorkflowRegistry().register(definition)
    const store = new InMemoryWorkflowStore()
    const starter = new WorkflowManager(store, registry, { idFactory: () => 'renewal-skew', clock: { now: () => 200 } })
    const worker = new WorkflowManager(store, registry, { tokenFactory: () => 'worker', clock: { now: () => 100 }, leaseDurationMs: 500, heartbeatIntervalMs: 5 })
    const canceller = new WorkflowManager(store, registry, { clock: { now: () => 300 } })
    const started = await starter.start(definition, {}, 'renewal-skew')
    const processing = worker.process(started.id)
    await startedHandler
    await canceller.cancel(started.id)

    await expect(processing).resolves.toMatchObject({ state: 'cancelled', cancellationRequested: true, updatedAt: 300 })
  })

  it('commits an effect fulfilled after cancellation abort and compensates its receipt exactly once', async () => {
    const effects: string[] = []
    let handlerSignal!: AbortSignal
    let handlerStarted!: () => void
    const startedHandler = new Promise<void>((resolve) => { handlerStarted = resolve })
    const compensate = vi.fn(({ stepOutput }: CompensationContext) => {
      const receipt = (stepOutput as { receipt: string }).receipt
      effects.splice(effects.indexOf(receipt), 1)
    })
    const run = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      handlerSignal = signal
      handlerStarted()
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      effects.push('charge-1')
      return { receipt: 'charge-1' }
    })
    const { manager, workflow } = setup([defineStep({ name: 'charge', run, compensate })], { leaseDurationMs: 100, heartbeatIntervalMs: 5 })
    const started = await manager.start(workflow, {}, 'abort-then-fulfill')
    const processing = manager.process(started.id)
    await startedHandler
    await manager.cancel(started.id)
    await vi.waitFor(() => expect(handlerSignal.aborted).toBe(true))

    const committed = await processing
    expect(committed).toMatchObject({ state: 'running', cancellationRequested: true, steps: [{ state: 'committed', output: { receipt: 'charge-1' } }] })
    expect(effects).toEqual(['charge-1'])
    const cancelled = await manager.run(started.id)
    expect(cancelled).toMatchObject({ state: 'cancelled', steps: [{ state: 'compensated' }] })
    expect(compensate).toHaveBeenCalledOnce()
    expect(compensate).toHaveBeenCalledWith(expect.objectContaining({ stepOutput: { receipt: 'charge-1' } }))
    expect(run).toHaveBeenCalledOnce()
    expect(effects).toEqual([])
  })

  it('treats a forged renewal cancellation receipt as lease loss', async () => {
    const { manager, workflow, store } = setup([defineStep({ name: 'long', run: async ({ signal }) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return null
    } })], { leaseDurationMs: 100, heartbeatIntervalMs: 5 })
    vi.spyOn(store, 'renewLease').mockImplementation(async (...args) => {
      const renewed = await InMemoryWorkflowStore.prototype.renewLease.apply(store, args)
      return { ...renewed, cancellationRequested: true, revision: renewed.revision + 1, state: 'cancelled' }
    })
    const started = await manager.start(workflow, {}, 'forged-renewal')
    await expect(manager.process(started.id)).rejects.toBeInstanceOf(WorkflowLeaseLostError)
    expect((await store.get(started.id))?.cancellationRequested).toBe(false)
  })

  it.each([
    ['lease token', (value: WorkflowSnapshot) => ({ ...value, lease: { ...value.lease!, token: 'other' } })],
    ['lease expiry', (value: WorkflowSnapshot) => ({ ...value, lease: { ...value.lease!, expiresAt: value.lease!.expiresAt + 1 } })],
    ['updatedAt', (value: WorkflowSnapshot) => ({ ...value, updatedAt: value.updatedAt + 1 })],
    ['revision', (value: WorkflowSnapshot) => ({ ...value, revision: value.revision + 1 })],
    ['state', (value: WorkflowSnapshot) => ({ ...value, state: 'failed' as const, steps: [{ ...value.steps[0]!, state: 'failed' as const, error: { name: 'Error', message: 'forged' } }] })],
    ['steps', (value: WorkflowSnapshot) => ({ ...value, steps: [{ ...value.steps[0]!, attempts: value.steps[0]!.attempts + 1 }] })],
    ['identity', (value: WorkflowSnapshot) => ({ ...value, workflowName: 'other' })],
  ])('treats a renewal receipt with altered %s as lease loss without business commit', async (_label, alter) => {
    const { manager, workflow, store } = setup([defineStep({ name: 'long', run: async ({ signal }) => {
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      return 'must-not-commit'
    } })], { leaseDurationMs: 100, heartbeatIntervalMs: 5 })
    const renew = store.renewLease.bind(store)
    vi.spyOn(store, 'renewLease').mockImplementation(async (...args) => alter(await renew(...args)) as Awaited<ReturnType<typeof renew>>)
    const started = await manager.start(workflow, {}, `forged-renew-${_label}`)
    await expect(manager.process(started.id)).rejects.toBeInstanceOf(WorkflowLeaseLostError)
    expect((await store.get(started.id))?.steps[0]).not.toHaveProperty('output')
  })

  it.each([
    ['state', (value: WorkflowSnapshot) => ({ ...value, state: 'cancelled' as const })],
    ['steps', (value: WorkflowSnapshot) => ({ ...value, steps: [{ ...value.steps[0]!, attempts: 1 }] })],
    ['revision', (value: WorkflowSnapshot) => ({ ...value, revision: value.revision + 1 })],
    ['lease', (value: WorkflowSnapshot) => ({ ...value, lease: { token: 'forged', expiresAt: 100 } })],
  ])('rejects a cancellation receipt with forged %s', async (_label, alter) => {
    const base = new InMemoryWorkflowStore()
    await base.create(snapshotFixture())
    const store = { ...base, get: (id: string) => base.get(id), requestCancellation: async (id: string, revision: number, now: number) => alter(await base.requestCancellation(id, revision, now)) } as unknown as WorkflowStore
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    await expect(new WorkflowManager(store, new WorkflowRegistry().register(definition), { clock: { now: () => 10 } }).cancel('id')).rejects.toBeInstanceOf(WorkflowStoreContractError)
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

  it('rejects an impostor definition and accepts an explicit registered reference', async () => {
    const registeredRun = vi.fn(() => null)
    const { manager, workflow } = setup([defineStep({ name: 'registered', run: registeredRun })])
    const impostor = defineWorkflow({ name: workflow.name, version: workflow.version, steps: [defineStep({ name: 'impostor', run: () => null })] })
    await expect(manager.start(impostor, {}, 'impostor')).rejects.toThrow('exact registered definition')
    const started = await manager.start({ name: workflow.name, version: workflow.version }, {}, 'authority')
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

  it('fences cancellation accepted immediately before final completion and compensates', async () => {
    const compensate = vi.fn()
    const { manager, workflow, store } = setup([defineStep({ name: 'charge', run: () => 'effect', compensate })])
    const started = await manager.start(workflow, {}, 'completion-race')
    const committed = await manager.process(started.id)
    const realCommit = store.commit.bind(store)
    vi.spyOn(store, 'commit').mockImplementationOnce(async (...args) => {
      await store.requestCancellation(args[0].id, args[1], args[3])
      return realCommit(...args)
    })

    const compensating = await manager.process(committed.id)
    expect(compensating).toMatchObject({ state: 'compensating', cancellationRequested: true, steps: [{ state: 'committed' }] })
    const cancelled = await manager.run(committed.id)
    expect(cancelled.state).toBe('cancelled')
    expect(compensate).toHaveBeenCalledOnce()
  })

  it('fences a terminal forward failure racing cancellation and preserves its failed attempt', async () => {
    let rejectAttempt!: (error: Error) => void
    let handlerStarted!: () => void
    const startedHandler = new Promise<void>((resolve) => { handlerStarted = resolve })
    const run = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectAttempt = reject; handlerStarted() }))
    const { manager, workflow } = setup([defineStep({ name: 'reject', run })], { leaseDurationMs: 1_000, heartbeatIntervalMs: 900 })
    const started = await manager.start(workflow, {}, 'failed-cancellation-race')
    const processing = manager.process(started.id)
    await startedHandler
    await manager.cancel(started.id)
    rejectAttempt(new Error('terminal rejection'))

    await expect(processing).resolves.toMatchObject({
      state: 'cancelled', cancellationRequested: true,
      steps: [{ state: 'failed', attempts: 1, error: { name: 'Error', message: 'terminal rejection' } }],
    })
    expect(run).toHaveBeenCalledOnce()
  })

  it('immediately compensates a retryable rejection merged with cancellation without rerunning the handler', async () => {
    const clock = new FakeClock(0)
    let rejectAttempt!: (error: Error) => void
    let handlerStarted!: () => void
    const startedHandler = new Promise<void>((resolve) => { handlerStarted = resolve })
    const compensate = vi.fn()
    const retrying = vi.fn(() => new Promise<never>((_resolve, reject) => { rejectAttempt = reject; handlerStarted() }))
    const { manager, workflow } = setup([
      defineStep({ name: 'effect', run: () => 'receipt', compensate }),
      defineStep({ name: 'retrying', maxAttempts: 2, run: retrying }),
    ], { clock, leaseDurationMs: 1_000, heartbeatIntervalMs: 900 })
    const started = await manager.start(workflow, {}, 'retry-cancellation-race')
    await manager.process(started.id)
    const processing = manager.process(started.id)
    await startedHandler
    await manager.cancel(started.id)
    rejectAttempt(new Error('retry later'))

    const merged = await processing
    expect(merged).toMatchObject({
      state: 'waiting_retry', cancellationRequested: true,
      steps: [{ state: 'committed' }, { state: 'waiting_retry', attempts: 1, retryAt: 10 }],
    })
    expect(workflowNextRetryAt(merged)).toBeNull()

    await expect(manager.run(started.id)).resolves.toMatchObject({ state: 'cancelled', steps: [{ state: 'compensated' }, { state: 'pending', attempts: 1 }] })
    expect(retrying).toHaveBeenCalledOnce()
    expect(compensate).toHaveBeenCalledOnce()
  })

  it('bypasses only a cancelled forward retry deadline', async () => {
    const clock = new FakeClock(0)
    const forward = setup([defineStep({ name: 'later', maxAttempts: 2, run: () => { throw new Error('retry') } })], { clock })
    const started = await forward.manager.start(forward.workflow, {}, 'cancel-future-forward')
    const waiting = await forward.manager.process(started.id)
    expect(waiting).toMatchObject({ state: 'waiting_retry', steps: [{ retryAt: 10 }] })
    const cancellationRequested = await forward.manager.cancel(started.id)
    expect(workflowNextRetryAt(cancellationRequested)).toBeNull()
    await expect(forward.manager.processResult(started.id)).resolves.toMatchObject({ outcome: 'processed', snapshot: { state: 'cancelled' } })

    const compensation = vi.fn(() => { throw new Error('refund later') })
    const compensating = setup([
      defineStep({ name: 'effect', maxAttempts: 2, run: () => 'receipt', compensate: compensation }),
      defineStep({ name: 'fail', run: () => { throw new Error('stop') } }),
    ], { clock, ids: ['compensation-backoff'] })
    const compensationStarted = await compensating.manager.start(compensating.workflow, {}, 'compensation-backoff')
    await compensating.manager.process(compensationStarted.id)
    await compensating.manager.cancel(compensationStarted.id)
    await compensating.manager.process(compensationStarted.id)
    const compensationWaiting = await compensating.manager.process(compensationStarted.id)
    expect(compensationWaiting).toMatchObject({ state: 'compensation_waiting_retry', cancellationRequested: true })
    expect(compensationWaiting.steps[0]).toMatchObject({ retryAt: 10 })
    expect(workflowNextRetryAt(compensationWaiting)).toBe(10)
    await expect(compensating.manager.processResult(compensationStarted.id)).resolves.toMatchObject({ outcome: 'waiting', retryAt: 10 })
    expect(compensation).toHaveBeenCalledOnce()
  })

  it('rejects direct terminal cancellation and invalid mutation arguments without changing the row', async () => {
    const store = new InMemoryWorkflowStore()
    const terminalSnapshots = [
      completedSnapshot({ id: 'completed', startKey: 'completed' }),
      snapshotFixture({ id: 'failed', startKey: 'failed', state: 'failed', steps: [{ ...snapshotFixture().steps[0]!, state: 'failed', attempts: 1, error: { name: 'Error', message: 'failed' } }] }),
      snapshotFixture({ id: 'compensated', startKey: 'compensated', state: 'compensated', steps: [{ ...snapshotFixture().steps[0]!, state: 'compensated', attempts: 1, compensationAttempts: 1, compensationIdempotencyKey: 'compensated:compensate:0', output: null }] }),
      snapshotFixture({ id: 'compensation-failed', startKey: 'compensation-failed', state: 'compensation_failed', steps: [{ ...snapshotFixture().steps[0]!, state: 'compensation_failed', attempts: 1, compensationAttempts: 1, compensationIdempotencyKey: 'compensation-failed:compensate:0', output: null, error: { name: 'Error', message: 'failed' } }] }),
      snapshotFixture({ id: 'cancelled', startKey: 'cancelled', state: 'cancelled', cancellationRequested: true }),
    ]
    for (const terminal of terminalSnapshots) {
      await store.create(terminal)
      await expect(store.requestCancellation(terminal.id, terminal.revision, terminal.updatedAt)).rejects.toBeInstanceOf(RevisionConflictError)
      expect(await store.get(terminal.id)).toEqual(terminal)
    }

    const active = snapshotFixture({ id: 'active', startKey: 'active' })
    await store.create(active)
    const invalidCalls = [
      () => store.claim(active.id, -1, 'lease', 0, 1),
      () => store.claim(active.id, 0, '', 0, 1),
      () => store.claim(active.id, 0, 'lease', -1, 1),
      () => store.claim(active.id, 0, 'lease', 1, 1),
      () => store.renewLease(active.id, 0, '', 0, 1),
      () => store.requestCancellation(active.id, -1, 0),
      () => store.requestCancellation(active.id, 0, -1),
      () => store.commit(active, -1, 'lease', 0),
      () => store.commit(active, 0, '', 0),
    ]
    for (const mutate of invalidCalls) await expect(mutate()).rejects.toThrow(TypeError)
    expect(await store.get(active.id)).toEqual(active)
  })

  it('bounds hostile handler errors and releases the lease after compensation failure', async () => {
    const hostile = Object.create(null)
    Object.defineProperties(hostile, {
      name: { get: () => '', enumerable: true },
      message: { get: () => 'x'.repeat(10_000), enumerable: true },
    })
    const { manager, workflow } = setup([
      defineStep({ name: 'effect', run: () => 'done', compensate: () => { throw hostile } }),
      defineStep({ name: 'fail', run: () => { throw new Error('stop') } }),
    ])
    const started = await manager.start(workflow, {}, 'bounded-compensation-error')
    const failed = await manager.run(started.id)
    expect(failed.state).toBe('compensation_failed')
    expect(failed).not.toHaveProperty('lease')
    expect(failed.steps[0]!.error).toEqual({ name: 'Error', message: 'x'.repeat(4096) })
  })

  it('normalizes empty and throwing error fields to deterministic fallbacks', async () => {
    const throwing = {}
    Object.defineProperties(throwing, {
      name: { get: () => { throw new Error('name getter') } },
      message: { get: () => { throw new Error('message getter') } },
      [Symbol.toPrimitive]: { value: () => { throw new Error('conversion') } },
    })
    const { manager, workflow } = setup([defineStep({ name: 'fail', run: () => { throw throwing } })])
    const started = await manager.start(workflow, {}, 'throwing-error-fields')
    expect((await manager.process(started.id)).steps[0]!.error).toEqual({ name: 'Error', message: 'Unknown workflow handler error' })

    const empty = setup([defineStep({ name: 'empty', run: () => { const error = new Error('placeholder'); error.name = ''; error.message = ''; throw error } })], { ids: ['empty-error-id'] })
    const emptyStarted = await empty.manager.start(empty.workflow, {}, 'empty-error-fields')
    expect((await empty.manager.process(emptyStarted.id)).steps[0]!.error).toEqual({ name: 'Error', message: 'Unknown workflow handler error' })
  })

  it.each(['symbol', 'non-enumerable', 'accessor', 'array-extra'] as const)('rejects malicious %s JSON without invoking a handler or getter', async (kind) => {
    const getter = vi.fn(() => 'injected')
    const input: Record<PropertyKey, unknown> | unknown[] = kind === 'array-extra' ? [] : { safe: true }
    if (kind === 'symbol') Reflect.set(input, Symbol('hidden'), 'injected')
    if (kind === 'non-enumerable') Object.defineProperty(input, 'hidden', { value: 'injected' })
    if (kind === 'accessor') Object.defineProperty(input, 'hidden', { get: getter, enumerable: true })
    if (kind === 'array-extra') Object.defineProperty(input, 'extra', { value: 'injected', enumerable: true })
    const run = vi.fn(() => null)
    const { manager, workflow, store } = setup([defineStep({ name: 'safe', run })])
    const create = vi.spyOn(store, 'create')
    await expect(manager.start(workflow, input as never, `malicious-${kind}`)).rejects.toThrow(TypeError)
    expect(getter).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
})

describe('workflow definition versioning', () => {
  it.each(['', '-1', '1-', 'a/b', 'a'.repeat(65), 'latest', 'LATEST', 'default', 'current'])('rejects invalid or reserved version %j', (version) => {
    expect(() => defineWorkflow({ name: 'order', version, steps: [defineStep({ name: 'run', run: () => null })] })).toThrow(InvalidWorkflowVersionError)
  })

  it('keeps versions case-sensitive, exact, typed, immutable, and in registration order', () => {
    const lower = defineWorkflow({ name: 'order', version: 'V1', steps: [defineStep({ name: 'run', run: () => null })] })
    const upper = defineWorkflow({ name: 'order', version: 'v1', steps: [defineStep({ name: 'run', run: () => null })] })
    const registry = new WorkflowRegistry().register(lower, upper)
    expect(registry.versions('order')).toEqual(['V1', 'v1'])
    expect(registry.resolve({ name: 'order', version: 'V1' })).toBe(lower)
    expect(registry.has({ name: 'order', version: '1' })).toBe(false)
    try { registry.resolve({ name: 'order', version: '1' }); throw new Error('expected missing definition') }
    catch (error) { expect(error).toMatchObject({ workflowName: 'order', workflowVersion: '1' }) }
    expect(() => registry.register(lower)).toThrow(DuplicateWorkflowDefinitionError)
    expect(Object.isFrozen(lower.steps[0])).toBe(true)
    expect(() => defineWorkflow({ name: 'a'.repeat(64), version: `a${'.'.repeat(62)}z`, steps: [defineStep({ name: 'step_1', run: () => null })] })).not.toThrow()
    expect(() => defineWorkflow({ name: 'bad name', version: '1', steps: [defineStep({ name: 'run', run: () => null })] })).toThrow(TypeError)
    expect(() => defineStep({ name: 'bad/step', run: () => null })).toThrow(TypeError)
  })

  it('registers a batch atomically when a later candidate is invalid or duplicated', () => {
    const first = defineWorkflow({ name: 'atomic', version: '1', steps: [defineStep({ name: 'run', run: () => null })] })
    const duplicate = defineWorkflow({ name: 'atomic', version: '1', steps: [defineStep({ name: 'other', run: () => null })] })
    const invalid = { name: 'atomic', version: '2', steps: [] }
    const registry = new WorkflowRegistry()
    expect(() => registry.register(first, invalid)).toThrow('at least one step')
    expect(registry.versions('atomic')).toEqual([])
    expect(() => registry.register(first, duplicate)).toThrow(DuplicateWorkflowDefinitionError)
    expect(registry.versions('atomic')).toEqual([])
    const existing = defineWorkflow({ name: 'existing', version: '1', steps: [defineStep({ name: 'run', run: () => null })] })
    registry.register(existing)
    expect(() => registry.register(first, existing)).toThrow(DuplicateWorkflowDefinitionError)
    expect(registry.versions('atomic')).toEqual([])
    expect(registry.versions('existing')).toEqual(['1'])
  })

  it('rejects custom resolver fallbacks before start or claim', async () => {
    const v1Run = vi.fn(() => null)
    const v1 = defineWorkflow({ name: 'fallback', version: '1', steps: [defineStep({ name: 'run', run: v1Run })] })
    const store = new InMemoryWorkflowStore()
    const create = vi.spyOn(store, 'create')
    const claim = vi.spyOn(store, 'claim')
    const manager = new WorkflowManager(store, { resolve: () => v1 })
    await expect(manager.start({ name: 'fallback', version: '2' }, {}, 'wrong')).rejects.toBeInstanceOf(WorkflowResolverContractError)
    expect(create).not.toHaveBeenCalled()
    await store.create(snapshotFixture({ id: 'fallback-row', workflowName: 'fallback', workflowVersion: '2', startKey: 'fallback-row' }))
    await expect(manager.process('fallback-row')).rejects.toBeInstanceOf(WorkflowResolverContractError)
    expect(claim).not.toHaveBeenCalled()
    expect(v1Run).not.toHaveBeenCalled()
  })

  it('runs each persisted version exactly and fails before claim for missing definitions or formats', async () => {
    const v1Run = vi.fn(() => null)
    const v2Run = vi.fn(() => null)
    const v1 = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'run', run: v1Run })] })
    const v2 = defineWorkflow({ name: 'order', version: '2', steps: [defineStep({ name: 'run', run: v2Run })] })
    const registry = new WorkflowRegistry().register(v1, v2)
    const store = new InMemoryWorkflowStore()
    const ids = ['v1-row', 'v2-row']
    const manager = new WorkflowManager(store, registry, { idFactory: () => ids.shift()!, tokenFactory: () => 'lease' })
    const v1Started = await manager.start(v1, {}, 'v1')
    const v2Started = await manager.start(v2, {}, 'v2')
    await manager.process(v1Started.id)
    expect(v1Run).toHaveBeenCalledOnce(); expect(v2Run).not.toHaveBeenCalled()
    await manager.process(v2Started.id)
    expect(v2Run).toHaveBeenCalledOnce()

    const missing = snapshotFixture({ id: 'missing', workflowName: 'missing', startKey: 'missing' })
    const unsupported = snapshotFixture({ id: 'unsupported', startKey: 'unsupported', snapshotFormatVersion: 2 as never })
    const claim = vi.spyOn(store, 'claim')
    const requestCancellation = vi.spyOn(store, 'requestCancellation')
    await store.create(missing)
    const claimsBeforeMissing = claim.mock.calls.length
    await expect(manager.process(missing.id)).rejects.toBeInstanceOf(WorkflowDefinitionNotFoundError)
    expect(claim).toHaveBeenCalledTimes(claimsBeforeMissing)
    await expect(manager.cancel(missing.id)).rejects.toBeInstanceOf(WorkflowDefinitionNotFoundError)
    expect(requestCancellation).not.toHaveBeenCalled()
    const unsupportedClaim = vi.fn(async () => unsupported)
    const unsupportedStore: WorkflowStore = {
      create: async () => { throw new Error('unused') }, get: async () => unsupported,
      claim: unsupportedClaim, renewLease: async () => { throw new Error('unused') },
      commit: async () => { throw new Error('unused') }, requestCancellation: async () => { throw new Error('unused') },
    }
    await expect(new WorkflowManager(unsupportedStore, registry).process(unsupported.id)).rejects.toBeInstanceOf(UnsupportedWorkflowSnapshotFormatError)
    expect(unsupportedClaim).not.toHaveBeenCalled()
    expect(() => manager.assertProcessable({ ...unsupported, snapshotFormatVersion: 1n as never })).toThrow(UnsupportedWorkflowSnapshotFormatError)
  })

  it('executes the isolated exact definition validated before claiming when a resolver changes implementations', async () => {
    const runA = vi.fn(() => 'a')
    const runB = vi.fn(() => 'b')
    const definitionA = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: runA })] })
    const definitionB = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: runB })] })
    const definitions = [definitionA, definitionB]
    const resolver = { resolve: vi.fn(() => definitions.shift() ?? definitionB) }
    const store = new InMemoryWorkflowStore()
    await store.create(snapshotFixture())
    const manager = new WorkflowManager(store, resolver, { tokenFactory: () => 'lease' })

    await expect(manager.process('id')).resolves.toMatchObject({ steps: [{ state: 'committed', output: 'a' }] })
    expect(runA).toHaveBeenCalledOnce()
    expect(runB).not.toHaveBeenCalled()
  })

  it('does not re-resolve to a post-claim fallback', async () => {
    const runA = vi.fn(() => 'a')
    const fallbackRun = vi.fn(() => 'fallback')
    const definitionA = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: runA })] })
    const fallback = defineWorkflow({ name: 'name', version: '2', steps: [defineStep({ name: 'one', run: fallbackRun })] })
    let resolutions = 0
    const store = new InMemoryWorkflowStore()
    await store.create(snapshotFixture())
    const manager = new WorkflowManager(store, { resolve: () => ++resolutions === 2 ? fallback : definitionA }, { tokenFactory: () => 'lease' })

    await expect(manager.process('id')).resolves.toMatchObject({ steps: [{ state: 'committed', output: 'a' }] })
    expect(runA).toHaveBeenCalledOnce()
    expect(fallbackRun).not.toHaveBeenCalled()
  })

  it('isolates a resolver definition from mutation during an awaited claim', async () => {
    const original = vi.fn(() => 'original')
    const replacement = vi.fn(() => 'replacement')
    const mutable = { name: 'name', version: '1', steps: [{ name: 'one', maxAttempts: 1, run: original }] }
    const backing = new InMemoryWorkflowStore()
    await backing.create(snapshotFixture())
    const store: WorkflowStore = {
      create: value => backing.create(value), get: id => backing.get(id), renewLease: (...args) => backing.renewLease(...args),
      claim: async (...args) => { const claimed = await backing.claim(...args); mutable.steps[0]!.run = replacement; return claimed },
      commit: (...args) => backing.commit(...args), requestCancellation: (...args) => backing.requestCancellation(...args),
    }
    const manager = new WorkflowManager(store, { resolve: () => mutable }, { tokenFactory: () => 'lease' })
    await expect(manager.process('id')).resolves.toMatchObject({ steps: [{ output: 'original' }] })
    expect(original).toHaveBeenCalledOnce()
    expect(replacement).not.toHaveBeenCalled()
  })

  it.each([
    ['forward attempts', { state: 'waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', attempts: 2, retryAt: 1, error: { name: 'Error', message: 'later' } }] }],
    ['compensation attempts', { state: 'compensation_waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'compensation_waiting_retry', attempts: 1, compensationAttempts: 2, output: null, compensationIdempotencyKey: 'id:compensate:0', retryAt: 1, error: { name: 'Error', message: 'later' } }] }],
  ] as const)('rejects corrupted %s before claim or handler execution', async (_label, alteration) => {
    const run = vi.fn(() => null)
    const compensate = vi.fn()
    const persisted = snapshotFixture(alteration as unknown as Partial<WorkflowSnapshot>)
    const claim = vi.fn(async () => persisted)
    const store = { get: vi.fn(async () => persisted), claim } as unknown as WorkflowStore
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', maxAttempts: 2, run, ...(_label === 'compensation attempts' ? { compensate } : {}) })] })
    await expect(new WorkflowManager(store, { resolve: () => definition }, { clock: { now: () => 1 } }).process('id')).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    expect(claim).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    expect(compensate).not.toHaveBeenCalled()
  })

  it('rejects custom store JSON accessors without invoking them or claiming', async () => {
    const getter = vi.fn(() => 'injected')
    const input = {}
    Object.defineProperty(input, 'hidden', { get: getter, enumerable: true })
    const persisted = snapshotFixture({ input })
    const claim = vi.fn()
    const run = vi.fn(() => null)
    const store = { get: vi.fn(async () => persisted), claim } as unknown as WorkflowStore
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })
    await expect(new WorkflowManager(store, { resolve: () => definition }).process('id')).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    expect(getter).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects terminal failure with uncompensated committed effects before claim', async () => {
    const compensate = vi.fn()
    const persisted = snapshotFixture({
      state: 'failed',
      steps: [
        { name: 'effect', state: 'committed', attempts: 1, compensationAttempts: 0, output: 'effect', idempotencyKey: 'id:step:0', compensationIdempotencyKey: 'id:compensate:0' },
        { name: 'failure', state: 'failed', attempts: 1, compensationAttempts: 0, error: { name: 'Error', message: 'failed' }, idempotencyKey: 'id:step:1' },
      ],
    })
    const claim = vi.fn()
    const store = { get: vi.fn(async () => persisted), claim } as unknown as WorkflowStore
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [
      defineStep({ name: 'effect', run: () => null, compensate }),
      defineStep({ name: 'failure', run: () => null }),
    ] })
    await expect(new WorkflowManager(store, { resolve: () => definition }).process('id')).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    expect(claim).not.toHaveBeenCalled()
    expect(compensate).not.toHaveBeenCalled()
  })

  it('rejects a failed-only compensating row with no definition compensation before claim', async () => {
    const run = vi.fn(() => null)
    const persisted = snapshotFixture({
      state: 'compensating',
      steps: [{ ...snapshotFixture().steps[0]!, state: 'failed', attempts: 1, error: { name: 'Error', message: 'failed' } }],
    })
    const claim = vi.fn()
    const store = { get: vi.fn(async () => persisted), claim } as unknown as WorkflowStore
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })

    await expect(new WorkflowManager(store, { resolve: () => definition }).process('id')).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    expect(claim).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('normalizes legacy missing formats from both get and claim and protects in-memory identity', async () => {
    const withoutFormat = (value: WorkflowSnapshot) => {
      const legacy = { ...value } as Partial<WorkflowSnapshot>
      delete legacy.snapshotFormatVersion
      return legacy as WorkflowSnapshot
    }
    const legacy = withoutFormat(snapshotFixture())
    const workflow = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const backing = new InMemoryWorkflowStore()
    const store: WorkflowStore = {
      create: value => backing.create(value), get: async id => withoutFormat((await backing.get(id))!),
      claim: async (...args) => withoutFormat(await backing.claim(...args)), renewLease: (...args) => backing.renewLease(...args),
      commit: (...args) => backing.commit(...args), requestCancellation: (...args) => backing.requestCancellation(...args),
    }
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(workflow))
    expect(manager.resolveSnapshot(legacy as WorkflowSnapshot)).toStrictEqual(workflow)

    await backing.create(snapshotFixture())
    await expect(manager.process('id')).resolves.toMatchObject({ snapshotFormatVersion: 1, steps: [{ state: 'committed' }] })
    const afterProcessing = (await backing.get('id'))!
    const claimed = await backing.claim('id', afterProcessing.revision, 'lease', Date.now(), Date.now() + 10_000)
    await expect(backing.commit({ ...claimed, workflowVersion: '2' }, claimed.revision, 'lease', 1)).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
    await expect(backing.commit({ ...claimed, input: { changed: true } }, claimed.revision, 'lease', 1)).rejects.toBeInstanceOf(WorkflowIdentityConflictError)
  })

  it('normalizes diagnostic status and initial terminal runs while rejecting unknown formats', async () => {
    const terminal = { ...completedSnapshot() } as Partial<WorkflowSnapshot>
    delete terminal.snapshotFormatVersion
    const workflow = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: () => null })] })
    const store = { get: vi.fn(async () => terminal as WorkflowSnapshot) } as unknown as WorkflowStore
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(workflow))
    const diagnosticManager = new WorkflowManager(store, new WorkflowRegistry())
    await expect(diagnosticManager.status('id')).resolves.toMatchObject({ snapshotFormatVersion: 1, state: 'completed' })
    await expect(diagnosticManager.run('id')).rejects.toBeInstanceOf(WorkflowDefinitionNotFoundError)
    await expect(manager.run('id')).resolves.toMatchObject({ snapshotFormatVersion: 1, state: 'completed' })
    terminal.snapshotFormatVersion = 2 as never
    await expect(diagnosticManager.status('id')).rejects.toBeInstanceOf(UnsupportedWorkflowSnapshotFormatError)
    await expect(manager.run('id')).rejects.toBeInstanceOf(UnsupportedWorkflowSnapshotFormatError)
  })

  it('safely reads bounded previous-release errors for every persisted error boundary', async () => {
    const longName = 'N'.repeat(256)
    const longMessage = 'M'.repeat(5000)
    const cases: WorkflowSnapshot[] = [
      snapshotFixture({ state: 'waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 1, error: { name: '', message: longMessage } }] }),
      snapshotFixture({ state: 'failed', steps: [{ ...snapshotFixture().steps[0]!, state: 'failed', attempts: 1, error: { name: longName, message: longMessage } }] }),
      snapshotFixture({ state: 'compensation_waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'compensation_waiting_retry', attempts: 1, compensationAttempts: 1, output: null, compensationIdempotencyKey: 'id:compensate:0', retryAt: 1, error: { name: '', message: longMessage } }] }),
      snapshotFixture({ state: 'compensation_failed', steps: [{ ...snapshotFixture().steps[0]!, state: 'compensation_failed', attempts: 1, compensationAttempts: 1, output: null, compensationIdempotencyKey: 'id:compensate:0', error: { name: longName, message: longMessage } }] }),
    ]
    delete (cases[0] as Partial<WorkflowSnapshot>).snapshotFormatVersion

    for (const legacy of cases) {
      const normalized = normalizePersistedWorkflowSnapshot(legacy)
      expect(normalized.snapshotFormatVersion).toBe(1)
      expect(normalized.steps[0]!.error!.name.length).toBeGreaterThan(0)
      expect(normalized.steps[0]!.error!.name.length).toBeLessThanOrEqual(128)
      expect(normalized.steps[0]!.error!.message).toHaveLength(4096)
      expect(() => assertWorkflowSnapshot(normalized)).not.toThrow()
    }
  })

  it.each([
    ['forward retry', snapshotFixture({ state: 'waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 1, error: { name: '', message: 'M'.repeat(5000) } }] }), false],
    ['compensation retry', snapshotFixture({ state: 'compensation_waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'compensation_waiting_retry', attempts: 1, compensationAttempts: 1, output: 'effect', compensationIdempotencyKey: 'id:compensate:0', retryAt: 1, error: { name: 'N'.repeat(256), message: 'M'.repeat(5000) } }] }), true],
  ] as const)('processes a previous-release %s row and persists a strictly valid transition', async (_label, legacy, compensating) => {
    const run = vi.fn(() => 'done')
    const compensate = vi.fn()
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', maxAttempts: 3, run, ...(compensating ? { compensate } : {}) })] })
    let current = legacy as WorkflowSnapshot
    const store: WorkflowStore = {
      get: async () => current,
      create: async () => { throw new Error('unused') },
      claim: async (_id, _revision, token, now, expiresAt) => {
        const normalized = normalizePersistedWorkflowSnapshot(current)
        current = { ...normalized, revision: normalized.revision + 1, updatedAt: Math.max(normalized.updatedAt, now), lease: { token, expiresAt } }
        return current
      },
      renewLease: async () => { throw new Error('unused') },
      commit: async (candidate, _revision, _token, _now, releaseLease = true) => {
        assertWorkflowSnapshot(candidate)
        const authoritative = normalizePersistedWorkflowSnapshot(current)
        current = { ...candidate, revision: authoritative.revision + 1, ...(releaseLease ? { lease: undefined } : { lease: authoritative.lease }) }
        if (current.lease === undefined) delete current.lease
        assertWorkflowSnapshot(current)
        return current
      },
      requestCancellation: async () => { throw new Error('unused') },
    }
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { clock: { now: () => 1 }, tokenFactory: () => 'lease' })

    const transitioned = await manager.process('id')
    expect(() => assertWorkflowSnapshot(transitioned)).not.toThrow()
    expect(transitioned.steps[0]!.error).toBeUndefined()
    expect(compensating ? compensate : run).toHaveBeenCalledOnce()
  })

  it('does not invoke persisted error getters and rejects ambiguous terminal cancellation race rows', async () => {
    const getter = vi.fn(() => 'unsafe')
    const error = { name: 'Error' } as { name: string, message?: string }
    Object.defineProperty(error, 'message', { get: getter, enumerable: true })
    const accessor = snapshotFixture({ state: 'failed', steps: [{ ...snapshotFixture().steps[0]!, state: 'failed', attempts: 1, error: error as never }] })
    expect(() => normalizePersistedWorkflowSnapshot(accessor)).toThrow(InvalidWorkflowSnapshotError)
    expect(getter).not.toHaveBeenCalled()

    const terminalRows = [
      { ...completedSnapshot(), cancellationRequested: true },
      snapshotFixture({ state: 'failed', cancellationRequested: true, steps: [{ ...snapshotFixture().steps[0]!, state: 'failed', attempts: 1, error: { name: '', message: 'M'.repeat(5000) } }] }),
    ]
    for (const row of terminalRows) {
      expect(() => normalizePersistedWorkflowSnapshot(row)).toThrow(InvalidWorkflowSnapshotError)
      const manager = new WorkflowManager({ get: async () => row } as unknown as WorkflowStore, new WorkflowRegistry())
      await expect(manager.status(row.id)).rejects.toBeInstanceOf(InvalidWorkflowSnapshotError)
    }
  })

  it('keeps oversized custom mutation receipts strict', async () => {
    const observed = snapshotFixture({ state: 'waiting_retry', steps: [{ ...snapshotFixture().steps[0]!, state: 'waiting_retry', attempts: 1, retryAt: 1, error: { name: 'Error', message: 'valid' } }] })
    const run = vi.fn(() => null)
    const store = {
      get: async () => observed,
      claim: async () => ({ ...observed, revision: 1, updatedAt: 1, lease: { token: 'lease', expiresAt: 30_001 }, steps: [{ ...observed.steps[0]!, error: { name: 'Error', message: 'M'.repeat(5000) } }] }),
    } as unknown as WorkflowStore
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', maxAttempts: 2, run })] })
    await expect(new WorkflowManager(store, new WorkflowRegistry().register(definition), { clock: { now: () => 1 }, tokenFactory: () => 'lease' }).process('id')).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(run).not.toHaveBeenCalled()
  })

  it.each([
    ['input', (claimed: WorkflowSnapshot) => ({ ...claimed, input: { changed: true } })],
    ['format', (claimed: WorkflowSnapshot) => ({ ...claimed, snapshotFormatVersion: 2 as never })],
    ['steps', (claimed: WorkflowSnapshot) => ({ ...claimed, steps: [{ ...claimed.steps[0]!, name: 'changed' }] })],
    ['state', (claimed: WorkflowSnapshot) => ({ ...claimed, state: 'completed' as const })],
    ['attempts', (claimed: WorkflowSnapshot) => ({ ...claimed, steps: [{ ...claimed.steps[0]!, attempts: 9 }] })],
    ['output', (claimed: WorkflowSnapshot) => ({ ...claimed, steps: [{ ...claimed.steps[0]!, output: 'forged' }] })],
    ['revision', (claimed: WorkflowSnapshot) => ({ ...claimed, revision: 9 })],
    ['lease token', (claimed: WorkflowSnapshot) => ({ ...claimed, lease: { token: 'replaced', expiresAt: claimed.lease!.expiresAt } })],
    ['lease expiry', (claimed: WorkflowSnapshot) => ({ ...claimed, lease: { token: claimed.lease!.token, expiresAt: claimed.lease!.expiresAt + 1 } })],
    ['updated timestamp', (claimed: WorkflowSnapshot) => ({ ...claimed, updatedAt: 2 })],
  ])('rejects claimed snapshots with altered %s before handler side effects', async (_field, alter) => {
    const run = vi.fn(() => null)
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })
    const observed = snapshotFixture()
    const store: WorkflowStore = {
      get: async () => observed,
      create: async () => { throw new Error('unused') },
      claim: async () => alter({ ...observed, revision: 1, updatedAt: 1, lease: { token: 'lease', expiresAt: 30_000 } }),
      renewLease: async () => { throw new Error('unused') }, commit: async () => { throw new Error('unused') }, requestCancellation: async () => { throw new Error('unused') },
    }
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { tokenFactory: () => 'lease' })
    await expect(manager.process('id')).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(run).not.toHaveBeenCalled()
  })

  it.each([
    ['input', (snapshot: WorkflowSnapshot) => ({ ...snapshot, input: { changed: true } })],
    ['version', (snapshot: WorkflowSnapshot) => ({ ...snapshot, workflowVersion: '2' })],
    ['idempotency key', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, idempotencyKey: 'attacker:key' }] })],
    ['steps', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, name: 'changed' }] })],
    ['pending step', (snapshot: WorkflowSnapshot) => ({ ...snapshot, state: 'pending' as const, steps: [{ ...snapshot.steps[0]!, state: 'pending' as const }] })],
    ['attempts', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, attempts: 0 }] })],
    ['output', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, output: 'forged' }] })],
    ['revision', (snapshot: WorkflowSnapshot) => ({ ...snapshot, revision: snapshot.revision + 1 })],
    ['missing lease', (snapshot: WorkflowSnapshot) => ({ ...snapshot, lease: undefined })],
    ['replaced lease', (snapshot: WorkflowSnapshot) => ({ ...snapshot, lease: { token: 'replaced', expiresAt: snapshot.lease!.expiresAt } })],
    ['timestamp', (snapshot: WorkflowSnapshot) => ({ ...snapshot, updatedAt: snapshot.updatedAt + 1 })],
  ])('rejects a running commit result with altered %s before the forward handler and retains its lease', async (_field, alter) => {
    const clock = new FakeClock()
    const run = vi.fn(() => null)
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })
    const backing = new InMemoryWorkflowStore()
    await backing.create(snapshotFixture())
    let commits = 0
    const store = maliciousCommitStore(backing, async (...args) => {
      const committed = await backing.commit(...args)
      return ++commits === 1 ? alter(committed) : committed
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { clock, tokenFactory: () => 'lease', leaseDurationMs: 30_000 })

    await expect(manager.process('id')).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(run).not.toHaveBeenCalled()
    await expect(manager.processResult('id')).resolves.toMatchObject({ outcome: 'contended' })
    clock.time = 30_000
    await expect(manager.process('id')).resolves.toMatchObject({ state: 'failed', steps: [{ state: 'failed', attempts: 1 }] })
    expect(run).not.toHaveBeenCalled()
  })

  it('does not run a handler after an attempt-start commit error and recovers only after lease expiry', async () => {
    const clock = new FakeClock()
    const run = vi.fn(() => 'done')
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })
    const backing = new InMemoryWorkflowStore()
    await backing.create(snapshotFixture())
    let commits = 0
    const store = maliciousCommitStore(backing, async (...args) => {
      if (++commits === 1) throw new Error('commit outcome unknown')
      return backing.commit(...args)
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { clock, tokenFactory: () => 'lease', leaseDurationMs: 30_000 })

    await expect(manager.process('id')).rejects.toThrow('commit outcome unknown')
    expect(run).not.toHaveBeenCalled()
    await expect(manager.processResult('id')).resolves.toMatchObject({ outcome: 'contended' })
    clock.time = 30_000
    await expect(manager.process('id')).resolves.toMatchObject({ steps: [{ state: 'committed', output: 'done' }] })
    expect(run).toHaveBeenCalledOnce()
  })

  it.each([
    ['state', (snapshot: WorkflowSnapshot) => ({ ...snapshot, state: 'running' as const })],
    ['attempts', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, compensationAttempts: 0 }] })],
    ['output', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, output: 'forged' }] })],
  ])('rejects altered compensation-start %s before the compensation handler', async (_field, alter) => {
    const compensate = vi.fn()
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run: () => null, compensate })] })
    const backing = new InMemoryWorkflowStore()
    await backing.create(snapshotFixture({
      state: 'compensating',
      steps: [{ name: 'one', state: 'committed', attempts: 1, compensationAttempts: 0, output: 'effect', idempotencyKey: 'id:step:0', compensationIdempotencyKey: 'id:compensate:0' }],
    }))
    const store = maliciousCommitStore(backing, async (...args) => {
      const committed = await backing.commit(...args)
      return alter(committed)
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { tokenFactory: () => 'lease' })

    await expect(manager.process('id')).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(compensate).not.toHaveBeenCalled()
  })

  it.each([
    ['state', (snapshot: WorkflowSnapshot) => ({ ...snapshot, state: 'completed' as const })],
    ['steps', (snapshot: WorkflowSnapshot) => ({ ...snapshot, steps: [{ ...snapshot.steps[0]!, output: 'forged' }] })],
    ['revision', (snapshot: WorkflowSnapshot) => ({ ...snapshot, revision: snapshot.revision + 1 })],
    ['retained lease', (snapshot: WorkflowSnapshot) => ({ ...snapshot, lease: { token: 'lease', expiresAt: 30_000 } })],
  ])('rejects a release commit with wrong %s', async (_field, alter) => {
    const run = vi.fn(() => 'done')
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })
    const backing = new InMemoryWorkflowStore()
    await backing.create(snapshotFixture())
    let commits = 0
    const store = maliciousCommitStore(backing, async (...args) => {
      const committed = await backing.commit(...args)
      return ++commits === 2 ? alter(committed) : committed
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { tokenFactory: () => 'lease' })

    await expect(manager.process('id')).rejects.toBeInstanceOf(WorkflowStoreContractError)
    expect(run).toHaveBeenCalledOnce()
  })

  it('accepts a retained lease renewed while an attempt-start commit completes', async () => {
    const clock = new FakeClock()
    const run = vi.fn(() => 'done')
    const definition = defineWorkflow({ name: 'name', version: '1', steps: [defineStep({ name: 'one', run })] })
    const backing = new InMemoryWorkflowStore()
    await backing.create(snapshotFixture())
    let commits = 0
    const store = maliciousCommitStore(backing, async (...args) => {
      if (++commits === 1) await backing.renewLease(args[0].id, args[1], args[2], 1, 60_000)
      return backing.commit(...args)
    })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { clock, tokenFactory: () => 'lease', leaseDurationMs: 30_000 })

    await expect(manager.process('id')).resolves.toMatchObject({ steps: [{ state: 'committed', output: 'done' }] })
    expect(run).toHaveBeenCalledOnce()
  })
})

describe('persisted workflow snapshot invariants', () => {
  const step = (name: string, index: number, state: WorkflowSnapshot['steps'][number]['state'], extra: Partial<WorkflowSnapshot['steps'][number]> = {}) => ({
    name, state, attempts: state === 'pending' ? 0 : 1, compensationAttempts: state.startsWith('compensat') ? 1 : 0,
    idempotencyKey: `id:step:${index}`, compensationIdempotencyKey: `id:compensate:${index}`,
    ...(['committed', 'compensating', 'compensation_waiting_retry', 'compensated', 'compensation_failed'].includes(state) ? { output: index } : {}),
    ...extra,
  })
  const boundary = (state: WorkflowSnapshot['state'], steps: WorkflowSnapshot['steps']): WorkflowSnapshot => snapshotFixture({ state, steps })

  it.each([
    ['pending', boundary('pending', [step('one', 0, 'pending'), step('two', 1, 'pending')])],
    ['running marker', boundary('running', [step('one', 0, 'committed'), step('two', 1, 'running')])],
    ['post-step running', boundary('running', [step('one', 0, 'committed'), step('two', 1, 'pending')])],
    ['forward waiting', boundary('waiting_retry', [step('one', 0, 'committed'), step('two', 1, 'waiting_retry', { retryAt: 10, error: { name: 'Error', message: 'later' } })])],
    ['forward failed', boundary('failed', [step('one', 0, 'committed'), step('two', 1, 'failed', { error: { name: 'Error', message: 'failed' } })])],
    ['completed', boundary('completed', [step('one', 0, 'committed'), step('two', 1, 'committed')])],
    ['compensation start with forward failure', boundary('compensating', [step('one', 0, 'committed'), step('two', 1, 'failed', { error: { name: 'Error', message: 'failed' } })])],
    ['active reverse compensation', boundary('compensating', [step('one', 0, 'compensating'), step('two', 1, 'compensated')])],
    ['compensation waiting', boundary('compensation_waiting_retry', [step('one', 0, 'compensation_waiting_retry', { retryAt: 10, error: { name: 'Error', message: 'later' } }), step('two', 1, 'compensated')])],
    ['compensated', boundary('compensated', [step('one', 0, 'compensated'), step('two', 1, 'compensated')])],
    ['compensation failed', boundary('compensation_failed', [step('one', 0, 'compensation_failed', { error: { name: 'Error', message: 'failed' } }), step('two', 1, 'compensated')])],
    ['cancelled during first attempt', { ...boundary('cancelled', [step('one', 0, 'pending', { attempts: 1 }), step('two', 1, 'pending')]), cancellationRequested: true }],
  ])('accepts the manager-produced %s boundary', (_label, value) => {
    expect(() => assertWorkflowSnapshot(value)).not.toThrow()
  })

  it.each([
    ['workflow enum', { state: 'invented' }],
    ['step enum', { steps: [{ ...snapshotFixture().steps[0]!, state: 'invented' }] }],
    ['order', { state: 'running', steps: [step('one', 0, 'pending'), step('two', 1, 'committed')] }],
    ['committed under pending', { state: 'pending', steps: [step('one', 0, 'committed')] }],
    ['missing output', { state: 'completed', steps: [{ ...step('one', 0, 'committed'), output: undefined }] }],
    ['missing error', { state: 'failed', steps: [step('one', 0, 'failed')] }],
    ['missing retry', { state: 'waiting_retry', steps: [step('one', 0, 'waiting_retry', { error: { name: 'Error', message: 'later' } })] }],
    ['completed cancellation', { state: 'completed', cancellationRequested: true, steps: [step('one', 0, 'committed')] }],
    ['cancelled without request', { state: 'cancelled', steps: [step('one', 0, 'pending', { attempts: 1 })] }],
    ['compensation failed after a lower-index step was already compensated', { state: 'compensation_failed', steps: [step('one', 0, 'compensated'), step('two', 1, 'compensation_failed', { error: { name: 'Error', message: 'failed' } })] }],
    ['all-pending compensating', { state: 'compensating', steps: [step('one', 0, 'pending')] }],
    ['all-pending compensated', { state: 'compensated', steps: [step('one', 0, 'pending')] }],
    ['output without attempt', { state: 'completed', steps: [step('one', 0, 'committed', { attempts: 0 })] }],
  ])('rejects malformed persisted %s state', (_label, alteration) => {
    expect(() => assertWorkflowSnapshot(snapshotFixture(alteration as Partial<WorkflowSnapshot>))).toThrow(InvalidWorkflowSnapshotError)
  })
})

function snapshotFixture(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return {
    snapshotFormatVersion: 1, id: 'id', workflowName: 'name', workflowVersion: '1', startKey: 'key', canonicalInput: '{}', input: {}, state: 'pending', revision: 0,
    cancellationRequested: false, createdAt: 0, updatedAt: 0,
    steps: [{ name: 'one', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'id:step:0' }],
    ...overrides,
  }
}

function completedSnapshot(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return snapshotFixture({ state: 'completed', steps: [{ ...snapshotFixture().steps[0]!, state: 'committed', attempts: 1, output: null }], ...overrides })
}

function maliciousCommitStore(backing: InMemoryWorkflowStore, commit: WorkflowStore['commit']): WorkflowStore {
  return {
    create: snapshot => backing.create(snapshot),
    get: id => backing.get(id),
    claim: (...args) => backing.claim(...args),
    renewLease: (...args) => backing.renewLease(...args),
    commit,
    requestCancellation: (...args) => backing.requestCancellation(...args),
  }
}

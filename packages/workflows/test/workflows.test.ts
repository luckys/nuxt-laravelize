/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it, vi } from 'vitest'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, LeaseConflictError, StartKeyConflictError, WorkflowManager, WorkflowRegistry } from '../src'
import type { Clock, WorkflowSnapshot } from '../src'

class FakeClock implements Clock {
  constructor(public time = 0) {}
  now() { return this.time }
}

function setup(steps: ReturnType<typeof defineStep>[], options: { clock?: FakeClock, ids?: string[] } = {}) {
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
  })
  return { workflow, registry, store, manager }
}

describe('WorkflowManager', () => {
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

function snapshotFixture(): WorkflowSnapshot {
  return {
    id: 'id', workflowName: 'name', workflowVersion: '1', startKey: 'key', canonicalInput: '{}', input: {}, state: 'pending', revision: 0,
    cancellationRequested: false, createdAt: 0, updatedAt: 0,
    steps: [{ name: 'one', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'id:step:0' }],
  }
}

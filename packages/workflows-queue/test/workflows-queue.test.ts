import { describe, expect, it, vi } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import type { Queue } from '@nuxt-laravelize/queue/runtime'
import { jobRegistryToken, queueToken } from '@nuxt-laravelize/queue/runtime'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
import { WorkflowCoordinator } from '../src/runtime/WorkflowCoordinator'
import { WorkflowJob } from '../src/runtime/WorkflowJob'
import { resolveWorkflowsQueueOptions } from '../src/runtime/options'
import WorkflowsQueueServiceProvider from '../src/runtime/server/WorkflowsQueueServiceProvider'
import { workflowCoordinatorToken, workflowManagerToken, workflowRegistryToken, workflowStoreToken } from '../src/runtime/tokens'
import QueueServiceProvider from '../../queue/src/runtime/server/QueueServiceProvider'

function setup(now = 100, definition = defineWorkflow({ name: 'order', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })) {
  const store = new InMemoryWorkflowStore()
  let id = 0
  const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), { idFactory: () => `workflow:${++id}`, tokenFactory: () => 'lease', clock: { now: () => now } })
  const published: Array<{ delay: number, job: WorkflowJob, options: Record<string, unknown> }> = []
  const queue: Queue = {
    push: vi.fn(async (job, options = {}) => {
      published.push({ delay: 0, job: job as WorkflowJob, options })
      return { id: String(options.id), queue: options.queue ?? 'default' }
    }),
    later: vi.fn(async (delay, job, options = {}) => {
      published.push({ delay, job: job as WorkflowJob, options })
      return { id: String(options.id), queue: options.queue ?? 'default' }
    }),
    chain: vi.fn(), batch: vi.fn(), batchStatus: vi.fn(), cancelBatch: vi.fn(), sync: vi.fn(), size: vi.fn(), clear: vi.fn(), onFailed: vi.fn(),
  }
  const coordinator = new WorkflowCoordinator(store, manager, queue, resolveWorkflowsQueueOptions({ queue: 'workflows', contentionDelayMs: 7, maxDelayMs: 20 }), () => now)
  return { coordinator, definition, manager, store, queue, published }
}

describe('workflow queue bridge', () => {
  it('persists before publishing and duplicate starts publish the same safe revision id', async () => {
    const { coordinator, definition, published } = setup()
    const first = await coordinator.start(definition, {}, 'same')
    const duplicate = await coordinator.start(definition, {}, 'same')
    expect(duplicate.id).toBe(first.id)
    expect(published.map(item => item.options.id)).toEqual([published[0]!.options.id, published[0]!.options.id])
    expect(String(published[0]!.options.id)).toMatch(/^workflow-[a-f0-9]{64}$/)
    expect(String(published[0]!.options.id)).not.toContain(':')
    expect(published[0]!.job.payload).toEqual({ workflowId: first.id })
  })

  it('publishes an immediate successor after one successful transition and stops at terminal', async () => {
    const { coordinator, definition, published } = setup()
    const started = await coordinator.start(definition, {}, 'success')
    await coordinator.process(started.id)
    expect(published).toHaveLength(2)
    await coordinator.process(started.id)
    expect(published).toHaveLength(2)
    expect(await coordinator.enqueue(started.id)).toBeNull()
  })

  it('schedules business waiting without throwing and caps its exact remaining delay', async () => {
    const run = () => {
      throw new Error('business')
    }
    const definition = defineWorkflow({ name: 'retry', version: '1', steps: [defineStep({ name: 'work', maxAttempts: 2, run })] })
    const { coordinator, published } = setup(100, definition)
    const started = await coordinator.start(definition, {}, 'waiting')
    await expect(coordinator.process(started.id)).resolves.toBeUndefined()
    expect(published.at(-1)?.delay).toBe(20)
  })

  it('publishes a cancelled forward retry successor immediately without rerunning its handler', async () => {
    const retrying = vi.fn(() => {
      throw new Error('later')
    })
    const definition = defineWorkflow({ name: 'cancel-retry', version: '1', steps: [
      defineStep({ name: 'effect', run: () => 'receipt', compensate: () => {} }),
      defineStep({ name: 'retrying', maxAttempts: 2, run: retrying }),
    ] })
    const { coordinator, manager, published, queue } = setup(100, definition)
    const started = await manager.start(definition, {}, 'cancelled-waiting')
    await manager.process(started.id)
    await manager.process(started.id)
    await manager.cancel(started.id)
    published.length = 0
    vi.mocked(queue.push).mockClear()
    vi.mocked(queue.later).mockClear()

    await coordinator.process(started.id)

    expect(published).toEqual([expect.objectContaining({ delay: 0 })])
    expect(queue.push).toHaveBeenCalledOnce()
    expect(queue.later).not.toHaveBeenCalled()
    expect(retrying).toHaveBeenCalledOnce()
  })

  it('separates contention scheduling and propagates publication failures', async () => {
    const { coordinator, definition, store, published, queue } = setup()
    const started = await coordinator.start(definition, {}, 'busy')
    await store.claim(started.id, started.revision, 'other', 100, 200)
    await coordinator.process(started.id)
    expect(published.at(-1)?.delay).toBe(7)
    vi.mocked(queue.push).mockRejectedValueOnce(new Error('transport down'))
    await expect(coordinator.enqueue(started.id)).rejects.toThrow('transport down')
  })

  it('makes duplicate concurrent jobs harmless without queue deduplication', async () => {
    let release!: () => void
    const effect = new Promise<void>((resolve) => {
      release = resolve
    })
    const run = vi.fn(async () => {
      await effect
      return null
    })
    const definition = defineWorkflow({ name: 'concurrent', version: '1', steps: [defineStep({ name: 'work', run })] })
    const { coordinator, manager, store, queue } = setup(100, definition)
    const duplicate = new WorkflowCoordinator(store, manager, queue, resolveWorkflowsQueueOptions({ contentionDelayMs: 7 }), () => 100)
    const started = await coordinator.start(definition, {}, 'duplicate')
    const first = coordinator.process(started.id)
    await vi.waitFor(async () => expect((await store.get(started.id))?.state).toBe('running'))
    await duplicate.process(started.id)
    release()
    await first
    expect(run).toHaveBeenCalledOnce()
  })

  it('rejects malformed payloads and unsafe transport options', () => {
    expect(() => new WorkflowJob({})).toThrow(TypeError)
    expect(() => new WorkflowJob({ workflowId: 'id', input: 'secret' })).toThrow(TypeError)
    expect(() => resolveWorkflowsQueueOptions({ queue: '', tries: 0 })).toThrow(TypeError)
    expect(() => resolveWorkflowsQueueOptions({ backoff: [], maxDelayMs: 0 })).toThrow(TypeError)
  })

  it('reconciles known IDs and reports terminal skips and publication failures', async () => {
    const { coordinator, definition, manager, queue } = setup()
    const active = await manager.start(definition, {}, 'active')
    const terminal = await manager.start(definition, {}, 'terminal')
    await manager.run(terminal.id)
    vi.mocked(queue.push).mockRejectedValueOnce(new Error('offline'))
    const result = await coordinator.reconcile([active.id, terminal.id, 'missing'])
    expect(result.skipped).toEqual([terminal.id])
    expect(result.failed.map(item => item.workflowId)).toEqual([active.id, 'missing'])
  })

  it('discovers and reconciles a bounded durable-store pass', async () => {
    const { coordinator, definition, manager, published } = setup()
    const first = await manager.start(definition, {}, 'first')
    const second = await manager.start(definition, {}, 'second')
    const terminal = await manager.start(definition, {}, 'terminal-discovery')
    await manager.run(terminal.id)
    const result = await coordinator.reconcileStore({ pageSize: 1 })
    expect(result).toEqual({ scheduled: [first.id, second.id], skipped: [], failed: [] })
    expect(published.map(item => item.job.payload.workflowId)).toEqual([first.id, second.id])
  })

  it('continues store reconciliation after a publication failure', async () => {
    const { coordinator, definition, manager, queue } = setup()
    const first = await manager.start(definition, {}, 'recovery-failure-1')
    const second = await manager.start(definition, {}, 'recovery-failure-2')
    vi.mocked(queue.push).mockRejectedValueOnce(new Error('offline'))
    const result = await coordinator.reconcileStore({ pageSize: 1 })
    expect(result.failed.map(item => item.workflowId)).toEqual([first.id])
    expect(result.scheduled).toEqual([second.id])
  })

  it('does not publish an unregistered exact version and continues reconciliation', async () => {
    const { coordinator, definition, manager, store, published } = setup()
    const unsupported = await manager.start(definition, {}, 'unsupported-source')
    const active = await manager.start(definition, {}, 'supported')
    await store.create({ ...unsupported, id: 'unsupported', workflowVersion: '2', startKey: 'unsupported' })
    const result = await coordinator.reconcile(['unsupported', active.id])
    expect(result.scheduled).toEqual([active.id])
    expect(result.failed).toMatchObject([{ workflowId: 'unsupported', error: { workflowName: definition.name, workflowVersion: '2' } }])
    expect(published.map(item => item.job.payload)).toEqual([{ workflowId: active.id }])
  })

  it('rejects resolver fallback output before publish, claim, or handler', async () => {
    const fallbackRun = vi.fn(() => null)
    const fallback = defineWorkflow({ name: 'fallback', version: '1', steps: [defineStep({ name: 'work', run: fallbackRun })] })
    const store = new InMemoryWorkflowStore()
    await store.create({ snapshotFormatVersion: 1, id: 'fallback-row', workflowName: 'fallback', workflowVersion: '2', startKey: 'fallback-row', canonicalInput: '{}', input: {}, state: 'pending', revision: 0, cancellationRequested: false, createdAt: 0, updatedAt: 0, steps: [{ name: 'work', state: 'pending', attempts: 0, compensationAttempts: 0, idempotencyKey: 'fallback-row:step:0' }] })
    const manager = new WorkflowManager(store, { resolve: () => fallback })
    const queue = { push: vi.fn(), later: vi.fn(), sync: vi.fn(), size: vi.fn(), clear: vi.fn(), onFailed: vi.fn() } as unknown as Queue
    const coordinator = new WorkflowCoordinator(store, manager, queue, resolveWorkflowsQueueOptions({}))
    const claim = vi.spyOn(store, 'claim')

    await expect(coordinator.enqueue('fallback-row')).rejects.toThrow('exact requested definition')
    await expect(coordinator.process('fallback-row')).rejects.toThrow('exact requested definition')
    expect(queue.push).not.toHaveBeenCalled()
    expect(claim).not.toHaveBeenCalled()
    expect(fallbackRun).not.toHaveBeenCalled()
  })

  it('keeps ID-only old jobs authoritative and executes the persisted exact version', async () => {
    const v1Run = vi.fn(() => null)
    const v2Run = vi.fn(() => null)
    const v1 = defineWorkflow({ name: 'versioned', version: '1', steps: [defineStep({ name: 'work', run: v1Run })] })
    const v2 = defineWorkflow({ name: 'versioned', version: '2', steps: [defineStep({ name: 'work', run: v2Run })] })
    const store = new InMemoryWorkflowStore()
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(v1, v2), { idFactory: () => 'old-row', tokenFactory: () => 'lease' })
    const started = await manager.start(v1, {}, 'old')
    const queue = { push: vi.fn(async () => ({ id: 'job', queue: 'workflows' })), later: vi.fn(), sync: vi.fn(), size: vi.fn(), clear: vi.fn(), onFailed: vi.fn() } as unknown as Queue
    const coordinator = new WorkflowCoordinator(store, manager, queue, resolveWorkflowsQueueOptions({}), () => 100)
    expect(new WorkflowJob({ workflowId: started.id }).payload).toEqual({ workflowId: started.id })
    await coordinator.process(started.id)
    expect(v1Run).toHaveBeenCalledOnce()
    expect(v2Run).not.toHaveBeenCalled()
  })

  it('requires the optional recovery discovery capability', async () => {
    const { coordinator, store } = setup()
    Object.defineProperty(store, 'discoverRecoverable', { value: undefined })
    await expect(coordinator.reconcileStore()).rejects.toThrow('does not support recovery discovery')
  })

  it('wires and rehydrates jobs through the real scoped Laravelize container', async () => {
    const container = createContainer()
    const queueProvider = new QueueServiceProvider()
    const provider = new WorkflowsQueueServiceProvider()
    queueProvider.register(container)
    provider.register(container)
    expect(container.has(workflowStoreToken)).toBe(false)
    const store = new InMemoryWorkflowStore()
    const pushed: WorkflowJob[] = []
    const queue = {
      push: vi.fn(async (job) => {
        pushed.push(job as WorkflowJob)
        return { id: 'id', queue: 'default' }
      }),
      later: vi.fn(), sync: vi.fn(), size: vi.fn(), clear: vi.fn(), onFailed: vi.fn(),
    } as unknown as Queue
    container.instance(workflowStoreToken, store)
    container.instance(queueToken, queue)
    provider.boot(container)
    const scope = container.createScope()
    const definition = defineWorkflow({ name: 'container', version: '1', steps: [defineStep({ name: 'work', run: () => null })] })
    scope.make(workflowRegistryToken).register(definition)
    expect(scope.make(workflowManagerToken)).toBeInstanceOf(WorkflowManager)
    const coordinator = scope.make(workflowCoordinatorToken)
    const started = await coordinator.start(definition, {}, 'container')
    const serialized = pushed[0]!.serialize()
    const rehydrated = container.make(jobRegistryToken).rehydrate(serialized)
    expect(rehydrated).toBeInstanceOf(WorkflowJob)
    await rehydrated.handle(scope)
    expect((await store.get(started.id))?.steps[0]?.state).toBe('committed')
  })
})

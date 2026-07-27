import { describe, expect, it } from 'vitest'
import { createContainer } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { currentExecutionContextOptional, runWithExecutionContext } from '@nuxt-laravelize/execution-context/runtime/server'
import { fakeExecutionContext } from '@nuxt-laravelize/execution-context/testing'
import { Job, JobMetadataContributorRegistry, JobSerializer, JobRunner, InMemoryJobRegistry, jobSerializerToken } from '@nuxt-laravelize/queue/runtime'
import { EXECUTION_CONTEXT_METADATA_KEY, installExecutionContextQueuePropagation } from '../src/runtime/propagation'

class ProbeJob extends Job {
  readonly payload = {}
  static seen: unknown
  constructor(_payload: Record<string, unknown> = {}) { super() }
  handle(resolver: ReturnType<typeof createContainer>) { ProbeJob.seen = resolver.make(executionContextToken).snapshot() }
}
class LegacyJob extends Job {
  readonly payload = {}
  static handled = false
  constructor(_payload: Record<string, unknown> = {}) { super() }
  handle() { LegacyJob.handled = true }
}
class FailedJob extends Job {
  readonly payload = {}
  static seen: unknown
  constructor(_payload: Record<string, unknown> = {}) { super() }
  handle() {}
  override failed() { FailedJob.seen = currentExecutionContextOptional()?.snapshot() }
}
class NestedJob extends Job {
  readonly payload = {}
  static serialized: ReturnType<JobSerializer['serialize']>
  constructor(_payload: Record<string, unknown> = {}) { super() }
  handle(resolver: ReturnType<typeof createContainer>) { NestedJob.serialized = resolver.make(jobSerializerToken).serialize(new ProbeJob()) }
}
class OverlapJob extends Job<{ id: string, delay: number }> {
  readonly payload: { id: string, delay: number }
  static seen = new Map<string, unknown>()
  constructor(payload: Record<string, unknown>) {
    super()
    this.payload = payload as { id: string, delay: number }
  }

  async handle() {
    await new Promise(resolve => setTimeout(resolve, this.payload.delay))
    OverlapJob.seen.set(this.payload.id, currentExecutionContextOptional()?.snapshot())
  }
}
describe('queue propagation', () => {
  it('captures context from the producer resolver without ambient HTTP state', () => {
    const container = createContainer()
    const scope = container.createScope()
    scope.override(executionContextToken, fakeExecutionContext({ correlationId: 'http-correlation', executionId: 'http-execution', locale: 'es' }))
    const contributors = new JobMetadataContributorRegistry()
    const runner = new JobRunner(container, new InMemoryJobRegistry())
    installExecutionContextQueuePropagation(contributors, runner, currentExecutionContextOptional)
    const serialized = new JobSerializer(contributors, scope).serialize(new ProbeJob())
    expect(currentExecutionContextOptional()).toBeUndefined()
    expect(serialized.version).toBe(2)
    if (serialized.version === 2) expect(serialized.metadata[EXECUTION_CONTEXT_METADATA_KEY]).toMatchObject({ correlationId: 'http-correlation', executionId: 'http-execution', locale: 'es' })
  })
  it('creates a worker context while preserving correlation and parent causation', async () => {
    const container = createContainer()
    const registry = new InMemoryJobRegistry()
    registry.register('ProbeJob', ProbeJob)
    const runner = new JobRunner(container, registry)
    const contributors = new JobMetadataContributorRegistry()
    const serializer = new JobSerializer(contributors)
    installExecutionContextQueuePropagation(contributors, runner, () => currentExecutionContextOptional() ?? fakeExecutionContext({ locale: 'es' }), () => 'worker-execution')
    await runner.run(serializer.serialize(new ProbeJob()))
    expect(ProbeJob.seen).toMatchObject({ executionId: 'worker-execution', correlationId: 'test-correlation', causationId: 'test-execution', locale: 'es', source: { type: 'queue', name: 'ProbeJob' } })
  })
  it('continues to decode stored version 1 jobs', async () => {
    const container = createContainer()
    const registry = new InMemoryJobRegistry()
    registry.register('LegacyJob', LegacyJob)
    await new JobRunner(container, registry).run({ version: 1, name: 'LegacyJob', payload: {} })
    expect(LegacyJob.handled).toBe(true)
  })
  it('uses the worker as causation when a job dispatches a nested job', async () => {
    const container = createContainer()
    const registry = new InMemoryJobRegistry()
    registry.register(NestedJob.name, NestedJob)
    const runner = new JobRunner(container, registry)
    const contributors = new JobMetadataContributorRegistry()
    container.scoped(jobSerializerToken, resolver => new JobSerializer(contributors, resolver))
    const serializer = new JobSerializer(contributors)
    installExecutionContextQueuePropagation(contributors, runner, () => currentExecutionContextOptional() ?? fakeExecutionContext({ locale: 'es' }), () => 'worker-execution')
    await runner.run(serializer.serialize(new NestedJob()))
    const nested = NestedJob.serialized
    expect(nested.version).toBe(2)
    if (nested.version === 2) expect(nested.metadata['laravelize.execution-context.v1']).toMatchObject({ correlationId: 'test-correlation', causationId: 'test-execution', executionId: 'worker-execution', locale: 'es' })
  })
  it('runs terminal failed hooks in the derived ambient context', async () => {
    const container = createContainer()
    const registry = new InMemoryJobRegistry()
    registry.register(FailedJob.name, FailedJob)
    const runner = new JobRunner(container, registry)
    const contributors = new JobMetadataContributorRegistry()
    const serializer = new JobSerializer(contributors)
    installExecutionContextQueuePropagation(contributors, runner, () => fakeExecutionContext(), () => 'failed-execution')
    await runner.failed(serializer.serialize(new FailedJob()), new Error('terminal'))
    expect(FailedJob.seen).toMatchObject({ executionId: 'failed-execution', correlationId: 'test-correlation' })
    expect(currentExecutionContextOptional()).toBeUndefined()
  })
  it('isolates overlapping worker contexts', async () => {
    const registry = new InMemoryJobRegistry()
    registry.register(OverlapJob.name, OverlapJob)
    const runner = new JobRunner(createContainer(), registry)
    const contributors = new JobMetadataContributorRegistry()
    const serializer = new JobSerializer(contributors)
    let worker = 0
    installExecutionContextQueuePropagation(contributors, runner, currentExecutionContextOptional, () => `worker-${++worker}`)
    const first = runWithExecutionContext(fakeExecutionContext({ executionId: 'producer-1', correlationId: 'correlation-1' }), () => serializer.serialize(new OverlapJob({ id: 'first', delay: 10 })))
    const second = runWithExecutionContext(fakeExecutionContext({ executionId: 'producer-2', correlationId: 'correlation-2' }), () => serializer.serialize(new OverlapJob({ id: 'second', delay: 1 })))
    await Promise.all([runner.run(first), runner.run(second)])
    expect(OverlapJob.seen.get('first')).toMatchObject({ correlationId: 'correlation-1', causationId: 'producer-1' })
    expect(OverlapJob.seen.get('second')).toMatchObject({ correlationId: 'correlation-2', causationId: 'producer-2' })
    expect(currentExecutionContextOptional()).toBeUndefined()
  })
  it('does not double-install contributors', () => {
    const runner = new JobRunner(createContainer(), new InMemoryJobRegistry())
    const contributors = new JobMetadataContributorRegistry()
    const serializer = new JobSerializer(contributors)
    const current = () => fakeExecutionContext()
    installExecutionContextQueuePropagation(contributors, runner, current)
    installExecutionContextQueuePropagation(contributors, runner, current)
    const serialized = serializer.serialize(new ProbeJob())
    expect(serialized.version).toBe(2)
    if (serialized.version === 2) expect(Object.keys(serialized.metadata)).toEqual(['laravelize.execution-context.v1'])
  })
})

/* eslint-disable @stylistic/max-statements-per-line, @typescript-eslint/no-useless-constructor */
import { describe, expect, it } from 'vitest'
import { createContainer, type Resolver } from '@nuxt-laravelize/core/runtime'
import { executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { currentExecutionContextOptional } from '@nuxt-laravelize/execution-context/runtime/server'
import { fakeExecutionContext } from '@nuxt-laravelize/execution-context/testing'
import { installExecutionContextQueuePropagation } from '../../execution-context-queue/src/runtime/propagation'
import { ObservabilityFake } from '@nuxt-laravelize/observability/testing'
import { InMemoryJobRegistry, Job, JobMetadataContributorRegistry, JobRunner, JobSerializer } from '@nuxt-laravelize/queue/runtime'
import { installQueueObservability, queueTraceMetadata } from '../src/bridge'

class Probe extends Job { static override jobName = 'probe'; static seen: unknown; readonly payload = {}; constructor() { super() } async handle(resolver: Resolver) { Probe.seen = resolver.has(executionContextToken) ? resolver.make(executionContextToken).snapshot() : undefined; await Promise.resolve() } }
describe('queue observability', () => {
  it('propagates only trace context and records a consumer span', async () => {
    const telemetry = new ObservabilityFake(); const contributors = new JobMetadataContributorRegistry(); const registry = new InMemoryJobRegistry(); registry.register(Probe.jobName, Probe); const runner = new JobRunner(createContainer(), registry)
    installQueueObservability(contributors, runner, telemetry, { jobs: ['probe'], queues: ['critical'] })
    const parent = telemetry.startSpan('producer'); const serialized = await telemetry.withSpan(parent, () => new JobSerializer(contributors).serialize(new Probe()))
    expect(queueTraceMetadata(serialized).traceparent).toMatch(/^00-/)
    await runner.run(serialized, { queue: 'critical', attempt: 1, maxAttempts: 2 })
    expect(telemetry.spans.at(-1)).toMatchObject({ name: 'queue.process', status: 'ok', ended: 1 })
    expect(telemetry.metrics.some(metric => metric.name === 'queue.process.jobs')).toBe(true)
  })
  it('ignores malformed and oversized metadata without failing jobs', async () => {
    const telemetry = new ObservabilityFake(); const registry = new InMemoryJobRegistry(); registry.register(Probe.jobName, Probe); const runner = new JobRunner(createContainer(), registry); installQueueObservability(new JobMetadataContributorRegistry(), runner, telemetry, { jobs: [], queues: [] })
    await expect(runner.run({ version: 2, name: 'probe', payload: {}, metadata: { 'laravelize.trace.v1': { traceparent: 'x'.repeat(1000), baggage: 'actor=admin' } } })).resolves.toBeUndefined()
    expect(telemetry.spans.at(-1)?.options.root).toBe(true)
  })
  it('defensively reads null, array, throwing proxy, and oversized metadata', () => {
    const throwing = new Proxy({}, { getPrototypeOf() { throw new Error('trap') } })
    for (const metadata of [null, [], throwing, Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, index]))]) {
      expect(() => queueTraceMetadata({ version: 2, name: 'probe', payload: {}, metadata } as never)).not.toThrow()
      expect(queueTraceMetadata({ version: 2, name: 'probe', payload: {}, metadata } as never)).toEqual({})
    }
  })
  it('runs the job exactly once when context activation invokes and then throws', async () => {
    const telemetry = new ObservabilityFake()
    telemetry.withSpan = ((_span, operation) => { operation(); throw new Error('activation') }) as typeof telemetry.withSpan
    const registry = new InMemoryJobRegistry(); registry.register(Probe.jobName, Probe); const runner = new JobRunner(createContainer(), registry)
    let executions = 0; runner.use('count', async (_job, _scope, next) => { executions++; await next() })
    installQueueObservability(new JobMetadataContributorRegistry(), runner, telemetry, { jobs: [], queues: [] })
    await expect(runner.run(new Probe().serialize())).resolves.toBeUndefined()
    expect(executions).toBe(1)
  })
  it('defaults to a root span, requires explicit parent trust, and does not instrument failed hooks', async () => {
    const carrier = { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' }
    for (const trustTraceContext of [false, true]) {
      const telemetry = new ObservabilityFake(); const contributors = new JobMetadataContributorRegistry(); const registry = new InMemoryJobRegistry(); registry.register(Probe.jobName, Probe); const runner = new JobRunner(createContainer(), registry)
      installQueueObservability(contributors, runner, telemetry, { jobs: [], queues: [], trustTraceContext })
      const serialized = { version: 2, name: 'probe', payload: {}, metadata: { 'laravelize.trace.v1': carrier } } as const
      await runner.run(serialized); await runner.failed(serialized, new Error('terminal'))
      expect(telemetry.spans).toHaveLength(1)
      expect(telemetry.spans[0]?.options).toMatchObject(trustTraceContext ? { parent: carrier } : { root: true })
    }
  })
  it('is idempotent and persists tracestate only when explicitly enabled', () => {
    const telemetry = new ObservabilityFake(); telemetry.inject = () => ({ traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01', tracestate: 'vendor=value' })
    const contributors = new JobMetadataContributorRegistry(); const runner = new JobRunner(createContainer(), new InMemoryJobRegistry())
    installQueueObservability(contributors, runner, telemetry, { jobs: [], queues: [] }); installQueueObservability(contributors, runner, telemetry, { jobs: [], queues: [] })
    const serialized = new JobSerializer(contributors).serialize(new Probe()); expect(queueTraceMetadata(serialized)).toEqual({ traceparent: expect.any(String) })
  })
  it('coexists with queue execution context without deriving another identity', async () => {
    const telemetry = new ObservabilityFake(); const contributors = new JobMetadataContributorRegistry(); const registry = new InMemoryJobRegistry(); registry.register(Probe.jobName, Probe); const runner = new JobRunner(createContainer(), registry)
    installExecutionContextQueuePropagation(contributors, runner, () => currentExecutionContextOptional() ?? fakeExecutionContext({ executionId: 'producer', correlationId: 'correlation', actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' }), () => 'worker')
    installQueueObservability(contributors, runner, telemetry, { jobs: ['probe'], queues: [] })
    await runner.run(new JobSerializer(contributors).serialize(new Probe()))
    expect(Probe.seen).toMatchObject({ executionId: 'worker', correlationId: 'correlation', causationId: 'producer', actor: { id: 'user-1' }, tenantId: 'tenant-1', source: { type: 'queue', name: 'probe' }, traceId: expect.any(String), spanId: expect.any(String) })
  })
  it('isolates queue metric creation and recording failures', async () => {
    const telemetry = new ObservabilityFake(); const calls: string[] = []
    telemetry.counter = (() => ({ add: () => { calls.push('counter.add'); throw new Error('counter') } })) as typeof telemetry.counter
    telemetry.histogram = (() => { calls.push('histogram.create'); return { record: () => { calls.push('histogram.record') } } }) as typeof telemetry.histogram
    const registry = new InMemoryJobRegistry(); registry.register(Probe.jobName, Probe); const runner = new JobRunner(createContainer(), registry)
    installQueueObservability(new JobMetadataContributorRegistry(), runner, telemetry, { jobs: [], queues: [] })
    await expect(runner.run(new Probe().serialize())).resolves.toBeUndefined()
    expect(calls).toEqual(['counter.add', 'histogram.create', 'histogram.record'])
  })
})

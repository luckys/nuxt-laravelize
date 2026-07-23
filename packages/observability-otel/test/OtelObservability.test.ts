/* eslint-disable @stylistic/max-statements-per-line */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { context } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OtelObservability } from '../src/OtelObservability'
import { bindObservability } from '../../observability/src/runtime/BoundObservability'

const managers: AsyncLocalStorageContextManager[] = []
afterEach(() => { for (const manager of managers.splice(0)) manager.disable(); context.disable() })
function fixture() {
  const exporter = new InMemorySpanExporter()
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  const manager = new AsyncLocalStorageContextManager().enable(); managers.push(manager); context.setGlobalContextManager(manager)
  return { exporter, provider, telemetry: new OtelObservability({ tracerProvider: provider, propagator: new W3CTraceContextPropagator(), forceFlush: () => provider.forceFlush(), shutdown: () => provider.shutdown() }) }
}
describe('OtelObservability', () => {
  it('activates parent/child spans across await and maps status', async () => {
    const { exporter, telemetry } = fixture(); const parent = telemetry.startSpan('parent')
    await telemetry.withSpan(parent, async () => { await Promise.resolve(); const child = telemetry.startSpan('child'); child.setStatus('ok'); child.end() }); parent.end()
    const [child, root] = exporter.getFinishedSpans()
    expect(child?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId)
    expect(child?.status.code).toBe(1)
  })
  it('extracts and injects only valid W3C trace context', () => {
    const { exporter, telemetry } = fixture(); const remoteTrace = '0af7651916cd43dd8448eb211c80319c'; const remoteSpan = 'b7ad6b7169203331'
    const span = telemetry.startSpan('consumer', { parent: { traceparent: `00-${remoteTrace}-${remoteSpan}-01` } })
    telemetry.withSpan(span, () => expect(telemetry.inject()).toEqual({ traceparent: expect.stringMatching(`^00-${remoteTrace}-`) }))
    span.end(); expect(exporter.getFinishedSpans()[0]?.parentSpanContext?.isRemote).toBe(true)
    expect(() => telemetry.startSpan('safe-root', { parent: { traceparent: 'invalid', tracestate: 'x'.repeat(600) } }).end()).not.toThrow()
  })
  it('keeps malformed explicit parents under a bound request span', () => {
    const { exporter, telemetry } = fixture(); const request = telemetry.startSpan('request', { root: true }); const bound = bindObservability(telemetry, request)
    const child = bound.startSpan('child', { root: false, parent: { traceparent: 'malformed', tracestate: 'vendor=value' } }); child.end(); request.end()
    const [finishedChild, finishedRequest] = exporter.getFinishedSpans()
    expect(finishedChild?.parentSpanContext?.spanId).toBe(finishedRequest?.spanContext().spanId)
  })
  it('caches fixed instruments and permits independent flushes', async () => {
    const forceFlush = vi.fn()
    const shutdown = vi.fn()
    const telemetry = new OtelObservability({ forceFlush, shutdown })
    expect(telemetry.counter('jobs')).toBe(telemetry.counter('jobs')); await telemetry.forceFlush(); await telemetry.forceFlush(); await telemetry.shutdown(); await telemetry.shutdown()
    expect(forceFlush).toHaveBeenCalledTimes(3)
    expect(shutdown).toHaveBeenCalledOnce()
  })
  it('does not let an active-span view end its native span', () => {
    const { exporter, telemetry } = fixture(); const span = telemetry.startSpan('owned')
    telemetry.withSpan(span, () => { telemetry.activeSpan()?.end(); telemetry.activeSpan()?.end(); expect(exporter.getFinishedSpans()).toHaveLength(0) })
    span.end(); expect(exporter.getFinishedSpans()).toHaveLength(1)
  })
  it('shares concurrent lifecycle work and retries failures before shutdown', async () => {
    let fail = true; const flush = vi.fn(async () => { if (fail) throw new Error('flush') }); const shutdown = vi.fn(); const telemetry = new OtelObservability({ forceFlush: flush, shutdown })
    await expect(Promise.all([telemetry.forceFlush(), telemetry.forceFlush()])).rejects.toThrow('flush')
    expect(flush).toHaveBeenCalledOnce(); fail = false; await telemetry.shutdown()
    expect(flush).toHaveBeenCalledTimes(2); expect(shutdown).toHaveBeenCalledOnce()
  })
  it('deduplicates only concurrent flushes', async () => {
    let release!: () => void; const pending = new Promise<void>((resolve) => { release = resolve }); const flush = vi.fn(() => pending); const telemetry = new OtelObservability({ forceFlush: flush })
    const first = telemetry.forceFlush(); const concurrent = telemetry.forceFlush(); expect(flush).not.toHaveBeenCalled(); await Promise.resolve(); expect(flush).toHaveBeenCalledOnce()
    release(); await Promise.all([first, concurrent]); await telemetry.forceFlush(); expect(flush).toHaveBeenCalledTimes(2)
  })
  it('serializes shutdown after an in-flight flush and performs a fresh final flush', async () => {
    let release!: () => void; const calls: string[] = []; const pending = new Promise<void>((resolve) => { release = resolve })
    const flush = vi.fn().mockImplementationOnce(async () => { calls.push('flush-1'); await pending }).mockImplementationOnce(() => { calls.push('flush-2') })
    const shutdown = vi.fn(() => { calls.push('shutdown') }); const telemetry = new OtelObservability({ forceFlush: flush, shutdown })
    const first = telemetry.forceFlush(); const stopping = telemetry.shutdown(); const duplicate = telemetry.shutdown(); await Promise.resolve(); expect(calls).toEqual(['flush-1'])
    release(); await Promise.all([first, stopping, duplicate]); expect(calls).toEqual(['flush-1', 'flush-2', 'shutdown']); await telemetry.shutdown(); expect(shutdown).toHaveBeenCalledOnce()
  })
  it('retries shutdown after failure without marking it complete', async () => {
    const flush = vi.fn(); const shutdown = vi.fn().mockRejectedValueOnce(new Error('shutdown')).mockResolvedValueOnce(undefined); const telemetry = new OtelObservability({ forceFlush: flush, shutdown })
    await expect(telemetry.shutdown()).rejects.toThrow('shutdown'); await telemetry.shutdown()
    expect(flush).toHaveBeenCalledTimes(2); expect(shutdown).toHaveBeenCalledTimes(2)
  })
})

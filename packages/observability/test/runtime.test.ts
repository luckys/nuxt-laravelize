/* eslint-disable @stylistic/max-statements-per-line */
import { describe, expect, it, vi } from 'vitest'
import { bindObservability, observe, safeErrorType, sanitizeCarrier, validateAttributes } from '../src/runtime/index'
import { ObservabilityFake } from '../src/testing/ObservabilityFake'
import { recordHttpCompletion } from '../src/runtime/server/recordHttpCompletion'
import { lifecycle } from '../src/runtime/server/lifecycle'

describe('portable observability', () => {
  it('keeps a span active across await and records success exactly once', async () => {
    const telemetry = new ObservabilityFake()
    await observe(telemetry, 'order.handle', async () => { await Promise.resolve(); expect(telemetry.activeSpan()?.spanId).toBeDefined() })
    expect(telemetry.spans[0]).toMatchObject({ status: 'ok', ended: 1, errors: [] })
  })
  it('preserves the original business error and records only its bounded type', async () => {
    const telemetry = new ObservabilityFake(); const error = new Error('secret patient payload')
    await expect(observe(telemetry, 'order.handle', () => { throw error })).rejects.toBe(error)
    expect(telemetry.spans[0]).toMatchObject({ status: 'error', ended: 1, errors: ['Error'] })
    expect(JSON.stringify(telemetry.spans)).not.toContain('secret patient payload')
  })
  it('isolates span observer failures after start from business results', async () => {
    const telemetry = new ObservabilityFake(); const span = telemetry.startSpan('probe')
    vi.spyOn(telemetry, 'startSpan').mockReturnValue({ ...span, setStatus: () => { throw new Error('exporter') }, end: () => { throw new Error('exporter') } })
    await expect(observe(telemetry, 'probe', () => 42)).resolves.toBe(42)
  })
  it('propagates startSpan failure before running business work', async () => {
    const telemetry = new ObservabilityFake(); const operation = vi.fn()
    vi.spyOn(telemetry, 'startSpan').mockImplementation(() => { throw new Error('cannot establish context') })
    await expect(observe(telemetry, 'probe', operation)).rejects.toThrow('cannot establish context'); expect(operation).not.toHaveBeenCalled()
  })
  it('rejects unbounded attributes and fails closed on malformed carriers', () => {
    expect(() => validateAttributes({ payload: {} as never })).toThrow(TypeError)
    expect(() => validateAttributes({ message: 'x'.repeat(257) })).toThrow(TypeError)
    expect(sanitizeCarrier({ traceparent: 'x'.repeat(129), baggage: 'identity=secret' })).toEqual({})
    expect(safeErrorType({ message: 'secret' })).toBe('object')
  })
  it('isolates concurrent active contexts', async () => {
    const telemetry = new ObservabilityFake(); const seen: string[] = []
    await Promise.all(['a', 'b'].map(name => observe(telemetry, `job.${name}`, async () => { await new Promise(resolve => setTimeout(resolve, name === 'a' ? 5 : 1)); seen.push(telemetry.activeSpan()!.spanId!) })))
    expect(new Set(seen).size).toBe(2)
  })
  it('has idempotent fake lifecycle counters when called by an owner once', async () => { const telemetry = new ObservabilityFake(); await telemetry.forceFlush(); await telemetry.shutdown(); expect([telemetry.flushes, telemetry.shutdowns]).toEqual([1, 1]) })
  it('binds implicit children and injection while preserving explicit parenting', () => {
    const telemetry = new ObservabilityFake(); const parent = telemetry.startSpan('request', { root: true }); const bound = bindObservability(telemetry, parent)
    const child = bound.startSpan('child'); const injected = bound.inject(); const explicitRoot = bound.startSpan('root', { root: true })
    expect(child.traceId).toBe(parent.traceId); expect(injected.traceparent).toContain(`-${parent.spanId}-`); expect(explicitRoot.traceId).not.toBe(parent.traceId); expect(bound.activeSpan()).toBe(parent)
    bound.withSpan(child, () => expect(bound.inject().traceparent).toContain(`-${child.spanId}-`))
    expect(parent).toMatchObject({ traceId: parent.traceId })
  })
  it('retains the bound parent unless root or a valid explicit parent is requested', () => {
    const telemetry = new ObservabilityFake(); const parent = telemetry.startSpan('request', { root: true }); const bound = bindObservability(telemetry, parent)
    const options = [{ root: false }, { parent: undefined }, { parent: {} }, { parent: { traceparent: 'invalid' } }]
    const children = options.map((value, index) => bound.startSpan(`child.${index}`, value))
    expect(children.every(child => child.traceId === parent.traceId)).toBe(true)

    const explicitParent = { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' }
    const startSpan = vi.spyOn(telemetry, 'startSpan'); bound.startSpan('explicit', { parent: explicitParent }); bound.startSpan('root', { root: true })
    expect(startSpan).toHaveBeenNthCalledWith(1, 'explicit', { parent: explicitParent })
    expect(startSpan).toHaveBeenNthCalledWith(2, 'root', { root: true })
  })
  it('sanitizes delegated parents and removes invalid parent and false root options', () => {
    const telemetry = new ObservabilityFake(); const parent = telemetry.startSpan('request', { root: true }); const bound = bindObservability(telemetry, parent); const startSpan = vi.spyOn(telemetry, 'startSpan')
    bound.startSpan('valid', { root: false, parent: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01', tracestate: 'bad state' } })
    bound.startSpan('invalid', { root: false, parent: { traceparent: 'invalid', tracestate: 'vendor=value' } })
    expect(startSpan).toHaveBeenNthCalledWith(1, 'valid', { parent: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' } })
    expect(startSpan).toHaveBeenNthCalledWith(2, 'invalid', {})
  })
  it('attempts bounded shutdown after rejected or timed-out flushes', async () => {
    const rejectedShutdown = vi.fn(); await lifecycle({ forceFlush: vi.fn().mockRejectedValue(new Error('flush')), shutdown: rejectedShutdown } as never, 5)
    expect(rejectedShutdown).toHaveBeenCalledOnce()
    const timedShutdown = vi.fn(); await lifecycle({ forceFlush: vi.fn(() => new Promise(() => {})), shutdown: timedShutdown } as never, 5)
    expect(timedShutdown).toHaveBeenCalledOnce()
  })
  it('isolates every HTTP completion telemetry operation', () => {
    const calls: string[] = []
    const span = { setAttributes: () => { calls.push('attributes'); throw new Error('attributes') }, setStatus: () => { calls.push('status'); throw new Error('status') }, recordErrorType: vi.fn(), end: vi.fn() }
    const observability = { counter: () => { calls.push('counter'); return { add: () => { calls.push('add'); throw new Error('add') } } } } as never
    expect(() => recordHttpCompletion({ span, observability, method: 'GET', route: '/probe' }, 200)).not.toThrow()
    expect(calls).toEqual(['attributes', 'status', 'counter', 'add'])
  })
})

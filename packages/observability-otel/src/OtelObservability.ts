/* eslint-disable @stylistic/max-statements-per-line, no-empty */
import { context, metrics, propagation, ROOT_CONTEXT, SpanKind as OtelKind, SpanStatusCode, trace, type Context, type MeterProvider, type TextMapPropagator, type TracerProvider } from '@opentelemetry/api'
import type { ActiveSpan, Counter, Histogram, Observability, PropagationCarrier, SpanKind, SpanOptions, UpDownCounter } from '@luckys_luis/nuxt-laravelize-observability/runtime'
import { sanitizeCarrier, validateAttributes, validateName } from '@luckys_luis/nuxt-laravelize-observability/runtime'

export interface OtelObservabilityOptions {
  tracerProvider?: TracerProvider
  meterProvider?: MeterProvider
  propagator?: TextMapPropagator
  instrumentationName?: string
  forceFlush?: () => void | Promise<void>
  shutdown?: () => void | Promise<void>
  onError?: (error: unknown) => void
}
const getter = { keys: (carrier: PropagationCarrier) => Object.keys(carrier), get: (carrier: PropagationCarrier, key: string) => carrier[key.toLowerCase() as keyof PropagationCarrier] }
const setter = { set: (carrier: PropagationCarrier, key: string, value: string) => { if (key === 'traceparent' || key === 'tracestate') carrier[key] = value } }
const kinds: Record<SpanKind, OtelKind> = { internal: OtelKind.INTERNAL, server: OtelKind.SERVER, client: OtelKind.CLIENT, producer: OtelKind.PRODUCER, consumer: OtelKind.CONSUMER }

export class OtelObservability implements Observability {
  readonly #tracer
  readonly #meter
  readonly #propagator
  readonly #options
  readonly #spans = new WeakMap<ActiveSpan, import('@opentelemetry/api').Span>()
  readonly #counters = new Map<string, Counter>()
  readonly #histograms = new Map<string, Histogram>()
  readonly #upDown = new Map<string, UpDownCounter>()
  #shutdown = false
  #flushPromise?: Promise<void>
  #shutdownPromise?: Promise<void>
  constructor(options: OtelObservabilityOptions = {}) {
    this.#options = options
    const name = options.instrumentationName ?? '@luckys_luis/nuxt-laravelize-observability'
    this.#tracer = (options.tracerProvider ?? trace.getTracerProvider()).getTracer(name)
    this.#meter = (options.meterProvider ?? metrics.getMeterProvider()).getMeter(name)
    this.#propagator = options.propagator ?? propagation
  }

  startSpan(name: string, options: SpanOptions = {}): ActiveSpan {
    validateName(name); validateAttributes(options.attributes)
    let parent: Context = options.root ? ROOT_CONTEXT : context.active()
    if (!options.root && options.parent?.traceparent) {
      try { parent = this.#propagator.extract(ROOT_CONTEXT, sanitizeCarrier(options.parent), getter) }
      catch (error) { this.#error(error); parent = ROOT_CONTEXT }
    }
    const links = options.links?.flatMap((link) => {
      try { const linked = this.#propagator.extract(ROOT_CONTEXT, sanitizeCarrier(link.carrier), getter); const spanContext = trace.getSpanContext(linked); return spanContext?.isRemote && trace.isSpanContextValid(spanContext) ? [{ context: spanContext, attributes: validateAttributes(link.attributes) }] : [] }
      catch (error) { this.#error(error); return [] }
    })
    const span = this.#tracer.startSpan(name, { kind: kinds[options.kind ?? 'internal'], attributes: options.attributes, ...(links?.length ? { links } : {}) }, parent)
    const ids = span.spanContext()
    let ended = false
    const active: ActiveSpan = {
      traceId: trace.isSpanContextValid(ids) ? ids.traceId : undefined, spanId: trace.isSpanContextValid(ids) ? ids.spanId : undefined,
      setAttributes: attributes => this.#safe(() => span.setAttributes(validateAttributes(attributes)!)),
      setStatus: status => this.#safe(() => span.setStatus({ code: status === 'error' ? SpanStatusCode.ERROR : status === 'ok' ? SpanStatusCode.OK : SpanStatusCode.UNSET })),
      recordErrorType: type => this.#safe(() => span.addEvent('exception', { 'exception.type': type })),
      end: () => { if (!ended) { ended = true; this.#safe(() => span.end()) } },
    }
    this.#spans.set(active, span); return active
  }

  withSpan<T>(span: ActiveSpan, operation: () => T): T { const native = this.#spans.get(span); return native ? context.with(trace.setSpan(context.active(), native), operation) : operation() }
  activeSpan(): ActiveSpan | undefined {
    const native = trace.getSpan(context.active()); if (!native) return undefined
    const ids = native.spanContext(); return { traceId: ids.traceId, spanId: ids.spanId, setAttributes: a => this.#safe(() => native.setAttributes(validateAttributes(a)!)), setStatus: s => this.#safe(() => native.setStatus({ code: s === 'error' ? SpanStatusCode.ERROR : s === 'ok' ? SpanStatusCode.OK : SpanStatusCode.UNSET })), recordErrorType: t => this.#safe(() => native.addEvent('exception', { 'exception.type': t })), end: () => {} }
  }

  counter(name: string): Counter { validateName(name); let value = this.#counters.get(name); if (!value) { const instrument = this.#meter.createCounter(name); value = { add: (amount = 1, attributes) => this.#safe(() => instrument.add(amount, validateAttributes(attributes))) }; this.#counters.set(name, value) } return value }
  histogram(name: string): Histogram { validateName(name); let value = this.#histograms.get(name); if (!value) { const instrument = this.#meter.createHistogram(name); value = { record: (amount, attributes) => this.#safe(() => instrument.record(amount, validateAttributes(attributes))) }; this.#histograms.set(name, value) } return value }
  upDownCounter(name: string): UpDownCounter { validateName(name); let value = this.#upDown.get(name); if (!value) { const instrument = this.#meter.createUpDownCounter(name); value = { add: (amount, attributes) => this.#safe(() => instrument.add(amount, validateAttributes(attributes))) }; this.#upDown.set(name, value) } return value }
  inject(carrier: PropagationCarrier = {}): PropagationCarrier {
    const output = sanitizeCarrier(carrier); try { this.#propagator.inject(context.active(), output, setter) }
    catch (error) { this.#error(error) } return sanitizeCarrier(output)
  }

  forceFlush(): Promise<void> {
    if (this.#shutdown) return Promise.resolve()
    if (this.#shutdownPromise) return this.#shutdownPromise
    return this.#flush()
  }

  shutdown(): Promise<void> {
    if (this.#shutdown) return Promise.resolve()
    if (!this.#shutdownPromise) {
      const inFlightFlush = this.#flushPromise
      this.#shutdownPromise = Promise.resolve()
        .then(async () => {
          if (inFlightFlush) {
            try { await inFlightFlush }
            catch {}
          }
        })
        .then(() => this.#flush())
        .then(() => this.#options.shutdown?.())
        .then(() => { this.#shutdown = true })
        .finally(() => { this.#shutdownPromise = undefined })
    }
    return this.#shutdownPromise
  }

  #flush(): Promise<void> {
    if (!this.#flushPromise) this.#flushPromise = Promise.resolve().then(() => this.#options.forceFlush?.()).finally(() => { this.#flushPromise = undefined })
    return this.#flushPromise
  }

  #safe(operation: () => unknown): void {
    try { operation() }
    catch (error) { this.#error(error) }
  }

  #error(error: unknown): void {
    try { this.#options.onError?.(error) }
    catch {}
  }
}

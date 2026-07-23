/* eslint-disable @stylistic/max-statements-per-line */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ActiveSpan, Attributes, Counter, Histogram, Observability, PropagationCarrier, SpanOptions, SpanStatus, UpDownCounter } from '../runtime/contracts'
import { sanitizeCarrier, validateAttributes, validateName } from '../runtime/validation'

export interface RecordedSpan { name: string, options: SpanOptions, attributes: Record<string, string | number | boolean>, status: SpanStatus, errors: string[], ended: number, traceId: string, spanId: string }
export interface RecordedMetric { type: 'counter' | 'histogram' | 'updown', name: string, value: number, attributes?: Attributes }
export class ObservabilityFake implements Observability {
  readonly spans: RecordedSpan[] = []
  readonly metrics: RecordedMetric[] = []
  readonly #storage = new AsyncLocalStorage<ActiveSpan>()
  #id = 0
  flushes = 0
  shutdowns = 0
  startSpan(name: string, options: SpanOptions = {}): ActiveSpan {
    validateName(name); validateAttributes(options.attributes)
    const id = (++this.#id).toString(16).padStart(16, '0')
    const parent = this.activeSpan()
    const record: RecordedSpan = { name, options, attributes: { ...options.attributes }, status: 'unset', errors: [], ended: 0, traceId: options.root || !parent ? id.padStart(32, '0') : parent.traceId!, spanId: id }
    const active: ActiveSpan = { traceId: record.traceId, spanId: record.spanId, setAttributes: a => Object.assign(record.attributes, validateAttributes(a)), setStatus: (s) => { record.status = s }, recordErrorType: (t) => { record.errors.push(t) }, end: () => { record.ended++ } }
    this.spans.push(record); return active
  }

  withSpan<T>(span: ActiveSpan, operation: () => T): T { return this.#storage.run(span, operation) }
  activeSpan(): ActiveSpan | undefined { return this.#storage.getStore() }
  counter(name: string): Counter { return { add: (value = 1, attributes) => this.#metric('counter', name, value, attributes) } }
  histogram(name: string): Histogram { return { record: (value, attributes) => this.#metric('histogram', name, value, attributes) } }
  upDownCounter(name: string): UpDownCounter { return { add: (value, attributes) => this.#metric('updown', name, value, attributes) } }
  inject(carrier: PropagationCarrier = {}): PropagationCarrier { const span = this.activeSpan(); return span?.traceId && span.spanId ? { ...sanitizeCarrier(carrier), traceparent: `00-${span.traceId}-${span.spanId}-01` } : sanitizeCarrier(carrier) }
  forceFlush(): void { this.flushes++ }
  shutdown(): void { this.shutdowns++ }
  #metric(type: RecordedMetric['type'], name: string, value: number, attributes?: Attributes): void { validateName(name); validateAttributes(attributes); if (!Number.isFinite(value)) throw new TypeError('Metric value must be finite'); this.metrics.push({ type, name, value, ...(attributes ? { attributes } : {}) }) }
}

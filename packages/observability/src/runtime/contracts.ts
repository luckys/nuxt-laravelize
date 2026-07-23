export type AttributeValue = string | number | boolean
export type Attributes = Readonly<Record<string, AttributeValue>>
export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer'
export type SpanStatus = 'unset' | 'ok' | 'error'
export interface PropagationCarrier { traceparent?: string, tracestate?: string }
export interface SpanLink { readonly carrier: PropagationCarrier, readonly attributes?: Attributes }
export interface SpanOptions { readonly kind?: SpanKind, readonly attributes?: Attributes, readonly parent?: PropagationCarrier, readonly root?: boolean, readonly links?: readonly SpanLink[] }
export interface ActiveSpan {
  readonly traceId?: string
  readonly spanId?: string
  setAttributes(attributes: Attributes): void
  setStatus(status: SpanStatus): void
  recordErrorType(type: string): void
  end(): void
}
export interface Counter { add(value?: number, attributes?: Attributes): void }
export interface Histogram { record(value: number, attributes?: Attributes): void }
export interface UpDownCounter { add(value: number, attributes?: Attributes): void }
export interface Observability {
  startSpan(name: string, options?: SpanOptions): ActiveSpan
  withSpan<T>(span: ActiveSpan, operation: () => T): T
  activeSpan(): ActiveSpan | undefined
  counter(name: string): Counter
  histogram(name: string): Histogram
  upDownCounter(name: string): UpDownCounter
  inject(carrier?: PropagationCarrier): PropagationCarrier
  forceFlush?(): void | Promise<void>
  shutdown?(): void | Promise<void>
}

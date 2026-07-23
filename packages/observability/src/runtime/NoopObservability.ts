/* eslint-disable @stylistic/max-statements-per-line */
import type { ActiveSpan, Counter, Histogram, Observability, PropagationCarrier, SpanOptions, SpanStatus, UpDownCounter } from './contracts'

const instrument: Counter & Histogram & UpDownCounter = Object.freeze({ add() {}, record() {} })
const span: ActiveSpan = Object.freeze({ setAttributes() {}, setStatus(_status: SpanStatus) {}, recordErrorType() {}, end() {} })
const emptyCarrier: PropagationCarrier = Object.freeze({})
export const noopObservability: Observability = Object.freeze({
  startSpan(_name: string, _options?: SpanOptions): ActiveSpan { return span },
  withSpan<T>(_span: ActiveSpan, operation: () => T): T { return operation() },
  activeSpan(): undefined { return undefined },
  counter(): Counter { return instrument }, histogram(): Histogram { return instrument }, upDownCounter(): UpDownCounter { return instrument },
  inject(_carrier?: PropagationCarrier): PropagationCarrier { return emptyCarrier },
  forceFlush() {}, shutdown() {},
})

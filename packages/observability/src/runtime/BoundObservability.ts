import type { ActiveSpan, Counter, Histogram, Observability, PropagationCarrier, SpanOptions, UpDownCounter } from './contracts'
import { sanitizeCarrier } from './validation'

/** Delegates telemetry while using a request span as the implicit parent. */
export class BoundObservability implements Observability {
  constructor(private readonly underlying: Observability, private readonly parent: ActiveSpan) {}

  startSpan(name: string, options?: SpanOptions): ActiveSpan {
    const { parent: explicitParent, root, ...rest } = options ?? {}
    if (root === true) return this.underlying.startSpan(name, { ...rest, root: true })
    const parent = sanitizeCarrier(explicitParent)
    if (parent.traceparent) return this.underlying.startSpan(name, { ...rest, parent })
    return this.underlying.withSpan(this.parent, () => this.underlying.startSpan(name, rest))
  }

  withSpan<T>(span: ActiveSpan, operation: () => T): T { return this.underlying.withSpan(span, operation) }
  activeSpan(): ActiveSpan | undefined { return this.underlying.activeSpan() ?? this.parent }
  counter(name: string): Counter { return this.underlying.counter(name) }
  histogram(name: string): Histogram { return this.underlying.histogram(name) }
  upDownCounter(name: string): UpDownCounter { return this.underlying.upDownCounter(name) }
  inject(carrier?: PropagationCarrier): PropagationCarrier {
    return this.underlying.activeSpan()
      ? this.underlying.inject(carrier)
      : this.underlying.withSpan(this.parent, () => this.underlying.inject(carrier))
  }

  forceFlush(): void | Promise<void> { return this.underlying.forceFlush?.() }
  shutdown(): void | Promise<void> { return this.underlying.shutdown?.() }
}

export function bindObservability(observability: Observability, parent: ActiveSpan): Observability {
  return new BoundObservability(observability, parent)
}

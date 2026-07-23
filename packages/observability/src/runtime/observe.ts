/* eslint-disable @stylistic/max-statements-per-line, no-empty */
import type { Attributes, Observability, SpanOptions } from './contracts'
import { safeErrorType, validateAttributes, validateName } from './validation'

export async function observe<T>(observability: Observability, name: string, operation: () => T | Promise<T>, options: SpanOptions = {}): Promise<T> {
  validateName(name)
  validateAttributes(options.attributes)
  // startSpan failures occur before business work; continuing would falsely claim an active scope.
  const span = observability.startSpan(name, options)
  let ended = false
  const end = () => {
    if (!ended) {
      ended = true; try { span.end() }
      catch {}
    }
  }
  try {
    return await observability.withSpan(span, async () => {
      try {
        const result = await operation()
        try { span.setStatus('ok') }
        catch {}
        return result
      }
      catch (error) {
        try { span.recordErrorType(safeErrorType(error)); span.setStatus('error') }
        catch {}
        throw error
      }
    })
  }
  finally { end() }
}

export function boundedAttributes(attributes: Attributes): Attributes { return validateAttributes(attributes) ?? {} }

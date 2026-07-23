/* eslint-disable @stylistic/max-statements-per-line, no-useless-escape */
import type { Attributes, AttributeValue, PropagationCarrier } from './contracts'

export const LIMITS = Object.freeze({ attributes: 32, key: 64, string: 256, name: 128, carrier: 512 })
const NAME = /^[a-z][\w.\-/]{0,127}$/i
const KEY = /^[a-z][\w.\-]{0,63}$/i
export function validateName(name: string): string {
  if (typeof name !== 'string' || !NAME.test(name)) throw new TypeError('Invalid telemetry name')
  return name
}
export function validateAttributes(input: Attributes | undefined): Attributes | undefined {
  if (input === undefined) return undefined
  if (Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError('Telemetry attributes must be a plain object')
  const entries = Object.entries(input)
  if (entries.length > LIMITS.attributes) throw new TypeError('Too many telemetry attributes')
  for (const [key, value] of entries) {
    if (!KEY.test(key) || !isAttribute(value)) throw new TypeError('Invalid telemetry attribute')
  }
  return input
}
function isAttribute(value: unknown): value is AttributeValue {
  return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= LIMITS.string)
}
export function safeErrorType(error: unknown): string {
  const candidate = error instanceof Error ? error.name : typeof error
  return /^[A-Z][\w.-]{0,63}$/i.test(candidate) ? candidate : 'Error'
}
export function sanitizeCarrier(value: unknown): PropagationCarrier {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return {}
  const source = value as Record<string, unknown>
  const traceparent = typeof source.traceparent === 'string' && /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/.test(source.traceparent) && !/^00-0{32}-0{16}-/.test(source.traceparent) ? source.traceparent : undefined
  const tracestate = traceparent && validHeader(source.tracestate, LIMITS.carrier) && /^[a-z0-9_@*=\-/.]+=[\x20-\x2B\x2D-\x3C\x3E-\x7E]+(?:,[a-z0-9_@*=\-/.]+=[\x20-\x2B\x2D-\x3C\x3E-\x7E]+)*$/.test(source.tracestate) ? source.tracestate : undefined
  return { ...(traceparent ? { traceparent } : {}), ...(tracestate ? { tracestate } : {}) }
}
function validHeader(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && /^[\x20-\x7E]+$/.test(value) }

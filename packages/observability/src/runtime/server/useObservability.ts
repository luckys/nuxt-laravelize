import type { H3Event } from 'h3'
import type { Observability } from '../contracts'
import { noopObservability } from '../NoopObservability'
import { observabilityToken } from '../tokens'

export function useObservability(event: H3Event): Observability {
  const scope = event.context.laravelizeContainer
  return scope?.has(observabilityToken) ? scope.make(observabilityToken) : noopObservability
}

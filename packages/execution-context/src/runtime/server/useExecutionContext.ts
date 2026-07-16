import type { H3Event } from 'h3'
import { executionContextToken, type ExecutionContext } from '../index'

export function useExecutionContext(event: H3Event): ExecutionContext {
  const scope = event.context.laravelizeContainer
  if (!scope) throw new Error('Laravelize request scope is unavailable')
  return scope.make(executionContextToken)
}

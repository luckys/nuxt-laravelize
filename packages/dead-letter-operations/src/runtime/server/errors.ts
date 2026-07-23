import { DeadLetterAdapterError, DeadLetterAmbiguousError, DeadLetterInvalidStateError, DeadLetterNotFoundError, DeadLetterOperationConflictError, DeadLetterStaleRevisionError, DeadLetterUnmanagedLegacyError } from '@nuxt-laravelize/dead-letter'

export interface DeadLetterHttpProblem { statusCode: number, code: string }

export function deadLetterHttpProblem(error: unknown): DeadLetterHttpProblem {
  if (error instanceof DeadLetterNotFoundError) return { statusCode: 404, code: 'not_found' }
  if (error instanceof DeadLetterStaleRevisionError) return { statusCode: 409, code: 'stale_revision' }
  if (error instanceof DeadLetterInvalidStateError) return { statusCode: 409, code: 'invalid_state' }
  if (error instanceof DeadLetterOperationConflictError) return { statusCode: 409, code: 'operation_conflict' }
  if (error instanceof DeadLetterUnmanagedLegacyError) return { statusCode: 409, code: 'unmanaged_legacy' }
  if (error instanceof DeadLetterAmbiguousError) return { statusCode: 503, code: 'ambiguous_outcome' }
  if (error instanceof DeadLetterAdapterError) return { statusCode: 503, code: 'unavailable' }
  if (error instanceof TypeError) return { statusCode: 400, code: 'invalid_request' }
  return { statusCode: 500, code: 'internal_error' }
}

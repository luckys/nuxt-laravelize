import { createError, type H3Error } from 'h3'
import { AuthorizationDeniedError } from '../errors'

export function toAuthorizationHttpError(error: unknown): H3Error | undefined {
  if (!(error instanceof AuthorizationDeniedError)) return undefined
  return createError({ statusCode: 403, statusMessage: 'Forbidden', data: { code: error.decision.code ?? 'forbidden' } })
}

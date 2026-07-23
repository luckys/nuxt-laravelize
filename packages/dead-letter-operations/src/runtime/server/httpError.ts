import { createError, type H3Error } from 'h3'

const marker = Symbol('dead-letter-operations-http-error')

export function operationsHttpError(statusCode: number, code: string): H3Error {
  const error = createError({ statusCode, statusMessage: statusCode === 403 ? 'Forbidden' : undefined, data: { code } })
  Object.defineProperty(error, marker, { value: true })
  return error
}

export function isOperationsHttpError(error: unknown): error is H3Error {
  return typeof error === 'object' && error !== null && (error as Record<PropertyKey, unknown>)[marker] === true
}

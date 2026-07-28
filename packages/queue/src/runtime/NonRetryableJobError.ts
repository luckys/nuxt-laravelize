export class NonRetryableJobError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) throw new TypeError('Invalid non-retryable job error code')
    super(message, options)
    this.name = 'NonRetryableJobError'
  }
}

export function isNonRetryableJobError(error: unknown): error is NonRetryableJobError {
  return error instanceof NonRetryableJobError
    || (!!error && typeof error === 'object' && (error as { name?: unknown }).name === 'NonRetryableJobError' && typeof (error as { code?: unknown }).code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test((error as { code: string }).code))
}

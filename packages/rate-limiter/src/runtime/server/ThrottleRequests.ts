import { createError, setResponseHeader, type H3Event } from 'h3'

import type { RateLimiter } from '../RateLimiter'

export interface ThrottleRequestsOptions {
  readonly key: (event: H3Event) => string | Promise<string>
  readonly maxAttempts?: number
  readonly decaySeconds?: number
}

export class ThrottleRequests {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly options: ThrottleRequestsOptions,
  ) {}

  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const result = await this.limiter.hit(
      await this.options.key(event),
      this.options.maxAttempts ?? 60,
      this.options.decaySeconds ?? 60,
    )
    setResponseHeader(event, 'X-RateLimit-Remaining', result.remaining)
    setResponseHeader(event, 'X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000))
    if (!result.allowed) {
      setResponseHeader(event, 'Retry-After', result.retryAfter)
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests',
        data: { message: 'Too many requests. Please try again later.' },
      })
    }
    return await next()
  }
}

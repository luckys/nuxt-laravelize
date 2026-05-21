import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

import type { Middleware } from '../../../src/http/Middleware'

export class LoggingMiddleware implements Middleware {
  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const response = await next()
    setResponseHeader(event, 'x-laravelize-logged', 'true')
    return response
  }
}

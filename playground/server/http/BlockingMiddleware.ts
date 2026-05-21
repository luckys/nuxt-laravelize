import { createError } from 'h3'

import type { Middleware } from '../../../src/http/Middleware'

export class BlockingMiddleware implements Middleware {
  handle(): unknown {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      data: { message: 'Blocked by middleware' },
    })
  }
}

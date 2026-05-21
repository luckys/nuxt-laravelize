import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'
import { globalMiddlewareToken } from '../../../src/http/GlobalMiddleware'

import { BlockingMiddleware } from '../http/BlockingMiddleware'
import { LoggingMiddleware } from '../http/LoggingMiddleware'
import { blockingMiddlewareToken, loggingMiddlewareToken } from '../http/middlewareTokens'

export default class MiddlewareProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(loggingMiddlewareToken, () => new LoggingMiddleware())
    container.scoped(blockingMiddlewareToken, () => new BlockingMiddleware())

    container.instance(globalMiddlewareToken, [loggingMiddlewareToken])
  }
}

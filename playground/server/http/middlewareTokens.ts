import { createToken } from '../../../src/core/container/Token'
import type { Middleware } from '../../../src/http/Middleware'

export const loggingMiddlewareToken = createToken<Middleware>('playground.logging-middleware')
export const blockingMiddlewareToken = createToken<Middleware>('playground.blocking-middleware')

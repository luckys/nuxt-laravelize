import type { Token } from '../core/container/Token'
import { createToken } from '../core/container/Token'

import type { Middleware } from './Middleware'

export const globalMiddlewareToken = createToken<readonly Token<Middleware>[]>('laravelize.globalMiddleware')

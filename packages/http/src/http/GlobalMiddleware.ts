import { createToken, type Token } from '@nuxt-laravelize/core/runtime'

import type { Middleware } from './Middleware'

export const globalMiddlewareToken = createToken<readonly Token<Middleware>[]>('laravelize.globalMiddleware')

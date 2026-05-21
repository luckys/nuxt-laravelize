import type { H3Event } from 'h3'

import type { Middleware } from './Middleware'

export async function runMiddlewarePipeline(
  event: H3Event,
  middlewares: readonly Middleware[],
  terminal: () => Promise<unknown>,
): Promise<unknown> {
  let lastDispatched = -1

  async function dispatch(index: number): Promise<unknown> {
    if (index <= lastDispatched) {
      throw new Error('next() called multiple times')
    }

    lastDispatched = index

    if (index === middlewares.length) {
      return await terminal()
    }

    const middleware = middlewares[index]!
    return await middleware.handle(event, () => dispatch(index + 1))
  }

  return await dispatch(0)
}

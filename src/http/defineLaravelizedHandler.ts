import { createError, defineEventHandler, type EventHandler } from 'h3'

import type { Token } from '../core/container/Token'
import { useContainer } from '../runtime/server/utils/useContainer'

import type { FormRequest } from './FormRequest'
import { globalMiddlewareToken } from './GlobalMiddleware'
import type { Middleware } from './Middleware'
import { runMiddlewarePipeline } from './MiddlewarePipeline'
import { validateFormRequest } from './validateFormRequest'

interface LaravelizedHandlerOptions<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
> {
  controller: Token<TController>
  method: TMethod
  request?: new () => TRequest
  middleware?: readonly Token<Middleware>[]
}

export function defineLaravelizedHandler<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
>(options: LaravelizedHandlerOptions<TController, TMethod, TRequest>): EventHandler {
  return defineEventHandler(async (event) => {
    const container = useContainer(event)
    const globals = container.has(globalMiddlewareToken) ? container.make(globalMiddlewareToken) : []
    const perHandler = options.middleware ?? []
    const middlewares = [...globals, ...perHandler].map(token => container.make(token))

    return await runMiddlewarePipeline(event, middlewares, async () => {
      const request = options.request ? new options.request() : null

      if (request?.authorize) {
        const authorized = await request.authorize(event)
        if (!authorized) {
          throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden',
            data: { message: 'This action is unauthorized.' },
          })
        }
      }

      const controller = container.make(options.controller)
      const input = request
        ? await validateFormRequest(event, request)
        : { body: undefined, query: undefined, params: undefined }
      const method = controller[options.method] as (input: unknown) => unknown
      return await method.call(controller, input)
    })
  })
}

import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(),
    getQuery: vi.fn(),
  }
})

vi.mock('../../src/runtime/server/utils/useContainer', () => ({
  useContainer: vi.fn(),
}))

// eslint-disable-next-line import/first
import * as h3 from 'h3'

// eslint-disable-next-line import/first
import type { Container } from '../../src/core/container/Container'
// eslint-disable-next-line import/first
import { createToken } from '../../src/core/container/Token'
// eslint-disable-next-line import/first
import { FormRequest } from '../../src/http/FormRequest'
// eslint-disable-next-line import/first
import { defineLaravelizedHandler } from '../../src/http/defineLaravelizedHandler'
// eslint-disable-next-line import/first
import { useContainer } from '../../src/runtime/server/utils/useContainer'
// eslint-disable-next-line import/first
import { globalMiddlewareToken } from '../../src/http/GlobalMiddleware'
// eslint-disable-next-line import/first
import type { Middleware } from '../../src/http/Middleware'
// eslint-disable-next-line import/first
import { Resource } from '../../src/http/resources/Resource'

interface UsersController {
  store(input: { body: { email: string }, query: undefined, params: undefined }): Promise<{ id: string }>
  index(input: { body: undefined, query: undefined, params: undefined }): Promise<Array<{ id: string }>>
}

const usersControllerToken = createToken<UsersController>('users-controller')

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

function createMockContainer(instance: unknown): Container {
  return { make: vi.fn().mockReturnValue(instance), has: vi.fn().mockReturnValue(false) } as unknown as Container
}

describe('defineLaravelizedHandler', () => {
  it('resolves the controller from the container and calls the method with the validated input', async () => {
    class CreateUserRequest extends FormRequest {
      override body() {
        return z.object({ email: z.string().email() })
      }
    }

    const controller: UsersController = {
      store: vi.fn().mockResolvedValue({ id: 'user-1' }),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))
    vi.mocked(h3.readBody).mockResolvedValue({ email: 'user@example.com' })

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreateUserRequest,
    })

    const event = createMockEvent()
    const response = await handler(event)

    expect(response).toEqual({ id: 'user-1' })
    expect(controller.store).toHaveBeenCalledWith({
      body: { email: 'user@example.com' },
      query: undefined,
      params: undefined,
    })
  })

  it('calls the method with all-undefined input when no request is configured', async () => {
    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual([{ id: 'user-1' }])
    expect(controller.index).toHaveBeenCalledWith({ body: undefined, query: undefined, params: undefined })
  })

  it('does not call the controller method when validation fails', async () => {
    class CreateUserRequest extends FormRequest {
      override body() {
        return z.object({ email: z.string().email() })
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))
    vi.mocked(h3.readBody).mockResolvedValue({ email: 'not-an-email' })

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreateUserRequest,
    })

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 422,
    })

    expect(controller.store).not.toHaveBeenCalled()
  })

  it('executes per-handler middleware before the controller', async () => {
    const events: string[] = []

    const tracingMiddleware: Middleware = {
      async handle(_event, next) {
        events.push('middleware:before')
        const value = await next()
        events.push('middleware:after')
        return value
      },
    }

    const tracingToken = createToken<Middleware>('tracing-middleware')
    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(async () => {
        events.push('controller:index')
        return [{ id: 'user-1' }]
      }),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === tracingToken) return tracingMiddleware
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn().mockReturnValue(false),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [tracingToken],
    })

    await handler(createMockEvent())

    expect(events).toEqual(['middleware:before', 'controller:index', 'middleware:after'])
  })

  it('runs global middleware (registered via globalMiddlewareToken) before per-handler middleware', async () => {
    const events: string[] = []

    const makeTracing = (label: string): Middleware => ({
      async handle(_event, next) {
        events.push(`${label}:before`)
        const value = await next()
        events.push(`${label}:after`)
        return value
      },
    })

    const globalToken = createToken<Middleware>('global-middleware')
    const perHandlerToken = createToken<Middleware>('per-handler-middleware')
    const globalInstance = makeTracing('global')
    const perHandlerInstance = makeTracing('per-handler')

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(async () => {
        events.push('controller:index')
        return []
      }),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === globalMiddlewareToken) return [globalToken]
        if (token === globalToken) return globalInstance
        if (token === perHandlerToken) return perHandlerInstance
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn(token => token === globalMiddlewareToken),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [perHandlerToken],
    })

    await handler(createMockEvent())

    expect(events).toEqual([
      'global:before',
      'per-handler:before',
      'controller:index',
      'per-handler:after',
      'global:after',
    ])
  })

  it('runs only per-handler middleware when globalMiddlewareToken is not registered', async () => {
    const events: string[] = []

    const perHandlerToken = createToken<Middleware>('per-handler-middleware')
    const perHandlerInstance: Middleware = {
      async handle(_event, next) {
        events.push('per-handler:before')
        const value = await next()
        events.push('per-handler:after')
        return value
      },
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(async () => {
        events.push('controller:index')
        return []
      }),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === perHandlerToken) return perHandlerInstance
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn().mockReturnValue(false),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [perHandlerToken],
    })

    await handler(createMockEvent())

    expect(events).toEqual(['per-handler:before', 'controller:index', 'per-handler:after'])
  })

  it('does not invoke the controller when a middleware short-circuits the pipeline', async () => {
    const blockingToken = createToken<Middleware>('blocking-middleware')
    const blockingInstance: Middleware = {
      handle() {
        return { status: 'blocked' }
      },
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === blockingToken) return blockingInstance
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn().mockReturnValue(false),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [blockingToken],
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual({ status: 'blocked' })
    expect(controller.index).not.toHaveBeenCalled()
  })

  it('throws a 403 with the Laravel-style payload when authorize returns false', async () => {
    class CreatePostRequest extends FormRequest {
      override body() {
        return z.object({ title: z.string() })
      }

      override authorize() {
        return false
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreatePostRequest,
    })

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 403,
      data: { message: 'This action is unauthorized.' },
    })

    expect(controller.store).not.toHaveBeenCalled()
  })

  it('continues to validation and the controller when authorize returns true', async () => {
    class CreatePostRequest extends FormRequest {
      override body() {
        return z.object({ title: z.string() })
      }

      override authorize() {
        return true
      }
    }

    const controller: UsersController = {
      store: vi.fn().mockResolvedValue({ id: 'post-1' }),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))
    vi.mocked(h3.readBody).mockResolvedValue({ title: 'Hello' })

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreatePostRequest,
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual({ id: 'post-1' })
    expect(controller.store).toHaveBeenCalledWith({
      body: { title: 'Hello' },
      query: undefined,
      params: undefined,
    })
  })

  it('awaits an async authorize that resolves false and short-circuits before validation runs', async () => {
    const readBodySpy = vi.mocked(h3.readBody)
    readBodySpy.mockReset()

    class CreatePostRequest extends FormRequest {
      override body() {
        return z.object({ title: z.string() })
      }

      override async authorize() {
        return false
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreatePostRequest,
    })

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 403,
    })

    expect(controller.store).not.toHaveBeenCalled()
    expect(readBodySpy).not.toHaveBeenCalled()
  })

  it('auto-serializes a Resource returned by the controller', async () => {
    class UserResource extends Resource<{ id: string }> {
      override toArray() {
        return { id: this.resource.id }
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(() => new UserResource({ id: 'u-1' })),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual({ id: 'u-1' })
  })

  it('auto-serializes a ResourceCollection returned by the controller', async () => {
    class UserResource extends Resource<{ id: string }> {
      override toArray() {
        return { id: this.resource.id }
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(() => UserResource.collection([{ id: 'u-1' }, { id: 'u-2' }])),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('returns a plain object untouched when the controller returns no Resource (regression)', async () => {
    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('passes the H3Event reference into the Resource toArray during auto-serialization', async () => {
    const spy = vi.fn().mockReturnValue({ id: 'u-1' })

    class UserResource extends Resource<{ id: string }> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(() => new UserResource({ id: 'u-1' })),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const event = createMockEvent()
    await handler(event)

    expect(spy).toHaveBeenCalledWith(event)
  })
})

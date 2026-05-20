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

interface UsersController {
  store(input: { body: { email: string }, query: undefined, params: undefined }): Promise<{ id: string }>
  index(input: { body: undefined, query: undefined, params: undefined }): Promise<Array<{ id: string }>>
}

const usersControllerToken = createToken<UsersController>('users-controller')

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

function createMockContainer(instance: unknown): Container {
  return { make: vi.fn().mockReturnValue(instance) } as unknown as Container
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
})

import type { H3Event } from 'h3'
import * as v from 'valibot'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(),
    getQuery: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'

// eslint-disable-next-line import/first
import { FormRequest } from '../../src/http/FormRequest'
// eslint-disable-next-line import/first
import { validateFormRequest } from '../../src/http/validateFormRequest'

function createMockEvent(params: Record<string, string> = {}): H3Event {
  return { context: { params } } as unknown as H3Event
}

describe('validateFormRequest', () => {
  beforeEach(() => {
    vi.mocked(h3.readBody).mockReset()
    vi.mocked(h3.getQuery).mockReset()
  })

  it('returns undefined for sections when the request declares no schemas', async () => {
    class EmptyRequest extends FormRequest {}

    const event = createMockEvent()
    const result = await validateFormRequest(event, new EmptyRequest())

    expect(result).toEqual({ body: undefined, query: undefined, params: undefined })
    expect(h3.readBody).not.toHaveBeenCalled()
    expect(h3.getQuery).not.toHaveBeenCalled()
  })

  it('validates body with a Zod schema and returns the parsed value', async () => {
    class CreateUserRequest extends FormRequest {
      override body() {
        return z.object({ email: z.string().email() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ email: 'user@example.com' })

    const result = await validateFormRequest(createMockEvent(), new CreateUserRequest())

    expect(result.body).toEqual({ email: 'user@example.com' })
    expect(result.query).toBeUndefined()
    expect(result.params).toBeUndefined()
  })

  it('validates query with a Valibot schema (agnostic across libraries)', async () => {
    class ListUsersRequest extends FormRequest {
      override query() {
        return v.object({ page: v.number() })
      }
    }

    vi.mocked(h3.getQuery).mockReturnValue({ page: 1 })

    const result = await validateFormRequest(createMockEvent(), new ListUsersRequest())

    expect(result.query).toEqual({ page: 1 })
  })

  it('validates params from event.context.params', async () => {
    class ShowUserRequest extends FormRequest {
      override params() {
        return z.object({ id: z.string() })
      }
    }

    const event = createMockEvent({ id: 'abc-123' })
    const result = await validateFormRequest(event, new ShowUserRequest())

    expect(result.params).toEqual({ id: 'abc-123' })
  })

  it('validates body, query, and params together when all three are declared', async () => {
    class UpdateUserRequest extends FormRequest {
      override body() {
        return z.object({ name: z.string() })
      }

      override query() {
        return z.object({ notify: z.literal('yes').or(z.literal('no')) })
      }

      override params() {
        return z.object({ id: z.string() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ name: 'Ada' })
    vi.mocked(h3.getQuery).mockReturnValue({ notify: 'yes' })

    const event = createMockEvent({ id: 'u-1' })
    const result = await validateFormRequest(event, new UpdateUserRequest())

    expect(result).toEqual({
      body: { name: 'Ada' },
      query: { notify: 'yes' },
      params: { id: 'u-1' },
    })
  })

  it('throws a 422 createError with a Laravel-style errors object when body is invalid', async () => {
    class CreateUserRequest extends FormRequest {
      override body() {
        return z.object({ email: z.string().email() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ email: 'not-an-email' })

    let caught: unknown
    try {
      await validateFormRequest(createMockEvent(), new CreateUserRequest())
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeDefined()
    const error = caught as { statusCode: number, data: { message: string, errors: Record<string, string[]> } }
    expect(error.statusCode).toBe(422)
    expect(error.data.message).toBe('Validation failed')
    expect(Object.keys(error.data.errors)).toContain('body.email')
    expect(error.data.errors['body.email']?.length).toBeGreaterThan(0)
  })

  it('aggregates errors from multiple sections into a single response', async () => {
    class UpdateUserRequest extends FormRequest {
      override body() {
        return z.object({ name: z.string().min(1) })
      }

      override query() {
        return z.object({ page: z.number() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ name: '' })
    vi.mocked(h3.getQuery).mockReturnValue({ page: 'not-a-number' })

    let caught: unknown
    try {
      await validateFormRequest(createMockEvent(), new UpdateUserRequest())
    }
    catch (error) {
      caught = error
    }

    const error = caught as { data: { errors: Record<string, string[]> } }
    expect(Object.keys(error.data.errors).sort()).toEqual(['body.name', 'query.page'])
  })
})

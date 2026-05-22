import { fileURLToPath } from 'node:url'

import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

await setup({
  rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
  server: true,
  browser: false,
})

describe('nuxt-laravelize integration', () => {
  it('exposes resolved services through the server util on each request', async () => {
    const first = await $fetch<{ counterValue: number, requestId: string }>('/api/laravelize')
    const second = await $fetch<{ counterValue: number, requestId: string }>('/api/laravelize')

    expect(first.counterValue).toBe(1)
    expect(second.counterValue).toBe(2)

    expect(first.requestId).not.toBe(second.requestId)
  })

  it('serves a page that uses the client container without errors', async () => {
    const html = await $fetch<string>('/')

    expect(html).toContain('data-testid="first-value"')
    expect(html).toContain('data-testid="second-value"')
  })

  it('creates a user when the request body is valid', async () => {
    const response = await $fetch<{ id: string, email: string, name: string }>('/api/users', {
      method: 'POST',
      body: { email: 'ada@example.com', name: 'Ada Lovelace' },
    })

    expect(response.id).toMatch(/^user-/)
    expect(response.email).toBe('ada@example.com')
    expect(response.name).toBe('Ada Lovelace')
  })

  it('returns a 422 with Laravel-style errors when the body is invalid', async () => {
    interface FetchErrorShape {
      status?: number
      statusCode?: number
      data?: { data?: { message: string, errors: Record<string, string[]> } }
      response?: { status: number, _data?: { data?: { message: string, errors: Record<string, string[]> } } }
    }

    let caught: FetchErrorShape | null = null
    try {
      await $fetch('/api/users', {
        method: 'POST',
        body: { email: 'not-an-email', name: '' },
      })
    }
    catch (error) {
      caught = error as FetchErrorShape
    }

    expect(caught).not.toBeNull()

    const status = caught?.status ?? caught?.statusCode ?? caught?.response?.status
    expect(status).toBe(422)

    const payload = caught?.data?.data ?? caught?.response?._data?.data
    expect(payload?.message).toBe('Validation failed')
    expect(Object.keys(payload?.errors ?? {}).sort()).toEqual(['body.email', 'body.name'])
  })

  it('applies global middleware to every request (sets x-laravelize-logged header)', async () => {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'global@example.com', name: 'Global Test' }),
    })

    expect(response.headers.get('x-laravelize-logged')).toBe('true')
  })

  it('returns 403 from per-handler middleware without invoking the controller', async () => {
    interface FetchErrorShape {
      status?: number
      statusCode?: number
      data?: { data?: { message: string } }
      response?: { status: number, _data?: { data?: { message: string } } }
    }

    let caught: FetchErrorShape | null = null
    try {
      await $fetch('/api/protected')
    }
    catch (error) {
      caught = error as FetchErrorShape
    }

    expect(caught).not.toBeNull()

    const status = caught?.status ?? caught?.statusCode ?? caught?.response?.status
    expect(status).toBe(403)

    const payload = caught?.data?.data ?? caught?.response?._data?.data
    expect(payload?.message).toBe('Blocked by middleware')
  })

  it('creates a post when the user is authorized', async () => {
    const response = await $fetch<{ id: string, title: string }>('/api/posts', {
      method: 'POST',
      headers: { 'x-user-role': 'author' },
      body: { title: 'Hello', content: 'World' },
    })

    expect(response.id).toMatch(/^post-/)
    expect(response.title).toBe('Hello')
  })

  it('returns 403 with the Laravel unauthorized message when the user is not authorized', async () => {
    interface FetchErrorShape {
      status?: number
      statusCode?: number
      data?: { data?: { message: string } }
      response?: { status: number, _data?: { data?: { message: string } } }
    }

    let caught: FetchErrorShape | null = null
    try {
      await $fetch('/api/posts', {
        method: 'POST',
        body: { title: 'Hello', content: 'World' },
      })
    }
    catch (error) {
      caught = error as FetchErrorShape
    }

    expect(caught).not.toBeNull()

    const status = caught?.status ?? caught?.statusCode ?? caught?.response?.status
    expect(status).toBe(403)

    const payload = caught?.data?.data ?? caught?.response?._data?.data
    expect(payload?.message).toBe('This action is unauthorized.')
  })
})

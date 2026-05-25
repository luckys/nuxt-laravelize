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

  it('returns a single user serialized by UserResource', async () => {
    const response = await $fetch<{ id: string, email: string, name: string, meta?: { role: string } }>('/api/users/user-1')

    expect(response.id).toBe('user-1')
    expect(response.email).toBe('ada@example.com')
    expect(response.name).toBe('Ada Lovelace')
    expect(response.meta).toBeUndefined()
  })

  it('includes meta.role when the x-user-role header is present (event flows to toArray)', async () => {
    const response = await $fetch<{ meta?: { role: string } }>('/api/users/user-1', {
      headers: { 'x-user-role': 'admin' },
    })

    expect(response.meta).toEqual({ role: 'admin' })
  })

  it('returns a paginated collection of users (first page, 5 per page by default)', async () => {
    const response = await $fetch<{
      data: Array<{ id: string, email: string, name: string }>
      meta: { current_page: number, per_page: number, total: number, last_page: number }
    }>('/api/users')

    expect(response.data).toHaveLength(5)
    expect(response.data[0]).toEqual({ id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' })
    expect(response.meta.current_page).toBe(1)
    expect(response.meta.per_page).toBe(5)
    expect(response.meta.total).toBe(12)
    expect(response.meta.last_page).toBe(3)
  })

  it('serializes nested Resources (Post -> author UserResource)', async () => {
    const response = await $fetch<{
      id: string
      title: string
      content: string
      author: { id: string, email: string, name: string }
    }>('/api/posts/post-seed-1')

    expect(response.id).toBe('post-seed-1')
    expect(response.title).toBe('Hello')
    expect(response.content).toBe('World')
    expect(response.author).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    })
  })

  it('dispatches UserRegistered and the sync listener records it', async () => {
    const before = await $fetch<{ welcome: string[] }>('/api/events-probe')
    const welcomeBefore = before.welcome.length

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'event-1@example.com', name: 'Event One' },
    })

    const after = await $fetch<{ welcome: string[] }>('/api/events-probe')
    expect(after.welcome.length).toBe(welcomeBefore + 1)
    expect(after.welcome[after.welcome.length - 1]).toMatch(/^user-/)
  })

  it('queued listener does not block the response and eventually records', async () => {
    const before = await $fetch<{ audit: string[] }>('/api/events-probe')
    const auditBefore = before.audit.length

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'event-q@example.com', name: 'Queued' },
    })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30)
    })

    const after = await $fetch<{ audit: string[] }>('/api/events-probe')
    expect(after.audit.length).toBe(auditBefore + 1)
  })

  it('subscriber registered in boot wires both listeners (welcome + audit)', async () => {
    const before = await $fetch<{ welcome: string[], audit: string[] }>('/api/events-probe')
    const welcomeBefore = before.welcome.length
    const auditBefore = before.audit.length

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'sub@example.com', name: 'Subscriber' },
    })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30)
    })

    const after = await $fetch<{ welcome: string[], audit: string[] }>('/api/events-probe')
    expect(after.welcome.length).toBe(welcomeBefore + 1)
    expect(after.audit.length).toBe(auditBefore + 1)
  })

  it('listenAny receives the dispatched event', async () => {
    const before = await $fetch<{ any: string[] }>('/api/events-probe')
    const anyBefore = before.any.length

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'any@example.com', name: 'AnyOne' },
    })

    const after = await $fetch<{ any: string[] }>('/api/events-probe')
    expect(after.any[after.any.length - 1]).toBe('UserRegistered')
    expect(after.any.length).toBe(anyBefore + 1)
  })

  it('listener with a container dependency (EventProbe) resolves correctly', async () => {
    const before = await $fetch<{ welcome: string[] }>('/api/events-probe')

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'dep@example.com', name: 'Dep' },
    })

    const after = await $fetch<{ welcome: string[] }>('/api/events-probe')
    expect(after.welcome.length).toBe(before.welcome.length + 1)
  })

  it('queue.push processes a job after microtask flush (probe records it)', async () => {
    const before = await $fetch<{ processed: string[] }>('/api/jobs-probe')
    const beforeCount = before.processed.length

    await $fetch('/api/jobs/process-video', { method: 'POST', body: { videoId: 'vid-1' } })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30)
    })

    const after = await $fetch<{ processed: string[] }>('/api/jobs-probe')
    expect(after.processed.length).toBe(beforeCount + 1)
    expect(after.processed[after.processed.length - 1]).toBe('vid-1')
  })

  it('queue.push returns a JobHandle with id and queue', async () => {
    const response = await $fetch<{ jobId: string, queue: string }>(
      '/api/jobs/process-video',
      { method: 'POST', body: { videoId: 'vid-2' } },
    )
    expect(response.jobId).toMatch(/^mem-/)
    expect(response.queue).toBe('default')
  })

  it('a failing job exceeds tries and is recorded as failure', async () => {
    const before = await $fetch<{ failures: Array<{ videoId: string }> }>('/api/jobs-probe')
    const beforeFailures = before.failures.length

    await $fetch('/api/jobs/process-video', { method: 'POST', body: { videoId: 'fail-always' } })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })

    const after = await $fetch<{ failures: Array<{ videoId: string }> }>('/api/jobs-probe')
    expect(after.failures.length).toBeGreaterThan(beforeFailures)
    expect(after.failures.some(f => f.videoId === 'fail-always')).toBe(true)
  })

  it('events with toPayload still trigger dispatcher → queue → ListenerJob → handler when queue is registered', async () => {
    const before = await $fetch<{ welcome: string[] }>('/api/events-probe')
    const beforeCount = before.welcome.length

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'queue-event@example.com', name: 'Queued Event User' },
    })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })

    const after = await $fetch<{ welcome: string[] }>('/api/events-probe')
    expect(after.welcome.length).toBe(beforeCount + 1)
  })

  it('queued listener via ListenerJob path also records to the audit probe', async () => {
    const before = await $fetch<{ audit: string[] }>('/api/events-probe')
    const beforeCount = before.audit.length

    await $fetch('/api/users/register', {
      method: 'POST',
      body: { email: 'queue-audit@example.com', name: 'Audit User' },
    })

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })

    const after = await $fetch<{ audit: string[] }>('/api/events-probe')
    expect(after.audit.length).toBe(beforeCount + 1)
  })

  it('post-register endpoint still returns 200 (queue does not block response)', async () => {
    const response = await $fetch<{ id: string }>('/api/users/register', {
      method: 'POST',
      body: { email: 'noblock@example.com', name: 'NoBlock' },
    })
    expect(response.id).toMatch(/^user-/)
  })

  it('GET /api/users?page=2&per_page=3 returns the second page with Laravel-shape meta', async () => {
    const response = await $fetch<{
      data: Array<{ id: string }>
      meta: { current_page: number, per_page: number, total: number, last_page: number, from: number | null, to: number | null }
    }>('/api/users?page=2&per_page=3')

    expect(response.data).toHaveLength(3)
    expect(response.data[0]?.id).toBe('user-4')
    expect(response.meta.current_page).toBe(2)
    expect(response.meta.per_page).toBe(3)
    expect(response.meta.total).toBe(12)
    expect(response.meta.last_page).toBe(4)
    expect(response.meta.from).toBe(4)
    expect(response.meta.to).toBe(6)
  })

  it('GET /api/users includes absolute URLs in links (first/last/prev/next)', async () => {
    const response = await $fetch<{
      links: { first: string | null, last: string | null, prev: string | null, next: string | null }
    }>('/api/users?page=2&per_page=3')

    expect(response.links.first).toMatch(/^https?:\/\/.+\/api\/users\?.*page=1.*per_page=3/)
    expect(response.links.last).toMatch(/^https?:\/\/.+\/api\/users\?.*page=4.*per_page=3/)
    expect(response.links.prev).toMatch(/page=1/)
    expect(response.links.next).toMatch(/page=3/)
  })

  it('GET /api/users?page=1&per_page=12 has prev=null and next=null (single page)', async () => {
    const first = await $fetch<{ links: { prev: string | null, next: string | null } }>('/api/users?page=1&per_page=12')
    expect(first.links.prev).toBe(null)
    expect(first.links.next).toBe(null)
  })

  it('GET /api/users-simple returns SimplePaginator shape (no last_page, no total)', async () => {
    const response = await $fetch<{
      data: Array<{ id: string }>
      meta: Record<string, unknown>
      links: { prev: string | null, next: string | null }
    }>('/api/users-simple?page=1')

    expect(response.data).toHaveLength(3)
    expect(response.meta).not.toHaveProperty('last_page')
    expect(response.meta).not.toHaveProperty('total')
    expect(response.meta).toMatchObject({ current_page: 1, per_page: 3 })
    expect(response.links.next).not.toBe(null)
  })

  it('GET /api/users-cursor returns CursorPaginator shape with encoded cursors', async () => {
    const response = await $fetch<{
      data: Array<{ id: string }>
      meta: { next_cursor: string | null, prev_cursor: string | null, per_page: number }
      links: { prev: string | null, next: string | null }
    }>('/api/users-cursor?per_page=2')

    expect(response.data).toHaveLength(2)
    expect(response.meta.per_page).toBe(2)
    expect(response.meta.next_cursor).not.toBe(null)
    expect(response.links.next).toMatch(/cursor=/)
  })
})

import { Readable } from 'node:stream'
import { createEvent, readBody, type H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { IdempotencyMiddleware } from '../../src/runtime/server/IdempotencyMiddleware'
import { InMemoryIdempotencyStore } from '../../src/runtime/store'

function event(body = '', key = 'key', url = '/orders', contentType?: string): H3Event {
  const req = Readable.from([Buffer.from(body)]) as Readable & { url: string, method: string, headers: Record<string, string>, socket: object }
  const requestHeaders: Record<string, string> = { 'host': 'example.com', 'idempotency-key': key, 'content-length': String(Buffer.byteLength(body)) }
  if (contentType) requestHeaders['content-type'] = contentType
  Object.assign(req, { url, method: 'POST', headers: requestHeaders, socket: {} })
  const headers: Record<string, string | string[]> = {}
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    getHeaders: () => headers,
    setHeader: (name: string, value: string | string[]) => { headers[name.toLowerCase()] = value },
  }
  const created = createEvent(req as never, res as never)
  created.context.testResponseHeaders = headers
  return created
}

describe('IdempotencyMiddleware', () => {
  it('replays status and safe headers without calling next or replaying cookies', async () => {
    const store = new InMemoryIdempotencyStore()
    const middleware = new IdempotencyMiddleware({ store, replayHeaders: ['x-result', 'set-cookie'] })
    const first = event()
    first.node.res.statusCode = 201
    first.node.res.setHeader('x-result', 'created')
    first.node.res.setHeader('set-cookie', 'secret=true')
    await middleware.handle(first, async () => ({ id: 1 }))
    const next = vi.fn()
    const replayEvent = event()
    await expect(middleware.handle(replayEvent, next)).resolves.toEqual({ id: 1 })
    expect(next).not.toHaveBeenCalled()
    expect(replayEvent.node.res.statusCode).toBe(201)
    expect(replayEvent.context.testResponseHeaders['x-result']).toBe('created')
    expect(replayEvent.context.testResponseHeaders['set-cookie']).toBeUndefined()
  })

  it('preserves the cached body and fingerprints exact raw bytes without lossy JSON parsing', async () => {
    const store = new InMemoryIdempotencyStore()
    const middleware = new IdempotencyMiddleware({ store })
    const first = event('{"b":2,"a":1}')
    await expect(middleware.handle(first, async () => ({ received: await readBody(first) }))).resolves.toEqual({ received: { b: 2, a: 1 } })
    await expect(middleware.handle(event('{"a":1,"b":2}'), vi.fn())).rejects.toMatchObject({ statusCode: 409 })
    await expect(middleware.handle(event('{"n":9007199254740993}', 'large-number'), async () => ({ ok: true }))).resolves.toEqual({ ok: true })
    await expect(middleware.handle(event('{"n":9007199254740992}', 'large-number'), vi.fn())).rejects.toMatchObject({ statusCode: 409 })
  })

  it('sorts query parameters and includes content type in the fingerprint', async () => {
    const store = new InMemoryIdempotencyStore()
    const middleware = new IdempotencyMiddleware({ store })
    await middleware.handle(event('same', 'query', '/orders?b=2&a=1', 'text/plain'), async () => ({ ok: true }))
    const replayNext = vi.fn()
    await middleware.handle(event('same', 'query', '/orders?a=1&b=2', 'text/plain'), replayNext)
    expect(replayNext).not.toHaveBeenCalled()
    await expect(middleware.handle(event('same', 'query', '/orders?a=1&b=2', 'application/json'), vi.fn())).rejects.toMatchObject({ statusCode: 409 })
  })

  it('replays standard Response bodies and rejects streaming/direct writes', async () => {
    const store = new InMemoryIdempotencyStore()
    const middleware = new IdempotencyMiddleware({ store })
    await middleware.handle(event('', 'response'), async () => new Response('saved', { status: 202, headers: { 'content-type': 'text/plain', 'set-cookie': 'no' } }))
    const replay = await middleware.handle(event('', 'response'), vi.fn()) as Response
    expect(await replay.text()).toBe('saved')
    expect(replay.status).toBe(202)
    expect(replay.headers.get('set-cookie')).toBeNull()

    const direct = event('', 'direct')
    await expect(middleware.handle(direct, async () => {
      Object.defineProperty(direct.node.res, 'headersSent', { value: true })
      return { impossible: true }
    })).rejects.toMatchObject({ statusCode: 500 })
  })

  it('rejects concurrent processing and fingerprint conflicts', async () => {
    const store = new InMemoryIdempotencyStore()
    const middleware = new IdempotencyMiddleware({ store, principal: e => e.context.principal as string ?? 'one' })
    let release!: () => void
    const pending = middleware.handle(event(), () => new Promise((resolve) => {
      release = () => resolve({ ok: true })
    }))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await expect(middleware.handle(event(), vi.fn())).rejects.toMatchObject({ statusCode: 409 })
    const conflicting = event()
    conflicting.context.principal = 'two'
    await expect(middleware.handle(conflicting, vi.fn())).rejects.toMatchObject({ statusCode: 409 })
    release()
    await pending
  })

  it('retains failures by default and preserves the original error when fail recording throws', async () => {
    const base = new InMemoryIdempotencyStore()
    const store = {
      acquire: base.acquire.bind(base),
      renew: base.renew.bind(base),
      complete: base.complete.bind(base),
      fail: vi.fn().mockRejectedValue(new Error('storage unavailable')),
    }
    const middleware = new IdempotencyMiddleware({ store })
    const original = new Error('application failed')
    await expect(middleware.handle(event('', 'failure'), async () => {
      throw original
    })).rejects.toBe(original)

    const retainedStore = new InMemoryIdempotencyStore()
    const retained = new IdempotencyMiddleware({ store: retainedStore })
    await expect(retained.handle(event('', 'retained'), async () => {
      throw original
    })).rejects.toBe(original)
    await expect(retained.handle(event('', 'retained'), vi.fn())).rejects.toMatchObject({ statusCode: 409 })
  })

  it('serializes heartbeat renewals and drains them before completion', async () => {
    const base = new InMemoryIdempotencyStore()
    let active = 0
    let maximumActive = 0
    let completed = false
    const store = {
      acquire: base.acquire.bind(base),
      renew: vi.fn(async (...args: Parameters<typeof base.renew>) => {
        active++
        maximumActive = Math.max(maximumActive, active)
        await new Promise(resolve => setTimeout(resolve, 15))
        active--
        return await base.renew(...args)
      }),
      complete: vi.fn(async (...args: Parameters<typeof base.complete>) => {
        expect(active).toBe(0)
        completed = true
        return await base.complete(...args)
      }),
      fail: base.fail.bind(base),
    }
    const middleware = new IdempotencyMiddleware({ store, leaseMs: 100, heartbeatMs: 5 })
    await middleware.handle(event('', 'heartbeat'), async () => {
      await new Promise(resolve => setTimeout(resolve, 35))
      return { ok: true }
    })
    expect(maximumActive).toBe(1)
    expect(completed).toBe(true)
    const renewalCount = store.renew.mock.calls.length
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(store.renew).toHaveBeenCalledTimes(renewalCount)
  })

  it('validates duration and size configuration', () => {
    for (const options of [
      { leaseMs: 0 },
      { retentionMs: -1 },
      { heartbeatMs: 10, leaseMs: 10 },
      { maxKeyBytes: Number.NaN },
      { maxBodyBytes: 1.5 },
      { maxResponseBytes: 0 },
    ]) expect(() => new IdempotencyMiddleware(options)).toThrow(TypeError)
  })
})

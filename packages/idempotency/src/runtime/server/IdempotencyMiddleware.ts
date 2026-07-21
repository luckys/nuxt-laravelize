import { createHash, randomUUID } from 'node:crypto'
import {
  createError,
  getHeader,
  getMethod,
  getRequestURL,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'
import type { IdempotencyStore, StoredResponse } from '../store'
import { useIdempotencyStore } from './useIdempotencyStore'

const NEVER_REPLAY = new Set(['connection', 'content-length', 'cookie', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'set-cookie', 'te', 'trailer', 'transfer-encoding', 'upgrade'])

export interface IdempotencyMiddlewareOptions {
  readonly store?: IdempotencyStore
  readonly requiredMethods?: readonly string[]
  readonly bypassMethods?: readonly string[]
  readonly principal?: (event: H3Event) => string | Promise<string>
  readonly route?: (event: H3Event) => string
  readonly leaseMs?: number
  readonly retentionMs?: number
  readonly heartbeatMs?: number
  readonly maxKeyBytes?: number
  readonly maxBodyBytes?: number
  readonly maxResponseBytes?: number
  readonly replayHeaders?: readonly string[]
  readonly failurePolicy?: 'retry' | 'retain'
  readonly now?: () => number
}

export class IdempotencyMiddleware {
  constructor(private readonly options: IdempotencyMiddlewareOptions = {}) {
    validateOptions(options)
  }

  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const method = getMethod(event).toUpperCase()
    const bypass = new Set((this.options.bypassMethods ?? ['GET', 'HEAD', 'OPTIONS']).map(value => value.toUpperCase()))
    if (bypass.has(method)) return await next()

    const key = getHeader(event, 'idempotency-key')?.trim()
    const required = new Set((this.options.requiredMethods ?? ['POST', 'PUT', 'PATCH', 'DELETE']).map(value => value.toUpperCase()))
    if (!key) {
      if (required.has(method)) throw httpError(400, 'Idempotency-Key is required.')
      return await next()
    }
    if (Buffer.byteLength(key) > (this.options.maxKeyBytes ?? 255)) throw httpError(400, 'Idempotency-Key is too large.')

    const rawBody = await readRawBody(event, false) ?? Buffer.alloc(0) // H3 caches the raw bytes, preserving later readBody/readRawBody calls.
    if (rawBody.byteLength > (this.options.maxBodyBytes ?? 1024 * 1024)) throw httpError(413, 'Request body is too large for idempotency.')
    const fingerprint = await this.fingerprint(event, method, rawBody)
    const store = this.options.store ?? useIdempotencyStore(event)
    const token = randomUUID()
    const now = this.options.now ?? Date.now
    const leaseMs = this.options.leaseMs ?? 30_000
    const retentionMs = this.options.retentionMs ?? 24 * 60 * 60 * 1000
    const acquired = await store.acquire({ key, fingerprint, leaseToken: token, now: now(), leaseMs, retentionMs, retryFailed: this.options.failurePolicy === 'retry' })

    if (acquired.outcome === 'conflict') throw httpError(409, 'Idempotency-Key was already used for a different request.')
    if (acquired.outcome === 'processing') throw httpError(409, 'A request with this Idempotency-Key is still processing.')
    if (acquired.outcome === 'failed') throw httpError(409, 'The previous request with this Idempotency-Key failed.')
    if (acquired.outcome === 'replay') return replay(event, acquired.record.response!)

    const heartbeatMs = this.options.heartbeatMs ?? Math.max(1, Math.floor(leaseMs / 3))
    let ownershipLost = false
    const stopHeartbeat = startHeartbeat(heartbeatMs, async () => {
      try {
        ownershipLost ||= !await store.renew(key, token, now(), leaseMs)
      }
      catch {
        ownershipLost = true
      }
    })
    try {
      const result = await next()
      await stopHeartbeat()
      if (ownershipLost) throw httpError(409, 'Idempotency lease ownership was lost.')
      const response = await capture(event, result, this.options)
      if (!await store.complete(key, token, response, now(), retentionMs)) throw httpError(409, 'Idempotency lease ownership was lost.')
      return result
    }
    catch (error) {
      await stopHeartbeat()
      try {
        await store.fail(key, token, now(), retentionMs)
      }
      catch {
        // The original application/capture error is authoritative.
      }
      throw error
    }
    finally {
      await stopHeartbeat()
    }
  }

  private async fingerprint(event: H3Event, method: string, rawBody: Buffer): Promise<string> {
    const route = this.options.route?.(event) ?? canonicalRoute(getRequestURL(event))
    const principal = await this.options.principal?.(event) ?? 'anonymous'
    const contentType = getHeader(event, 'content-type')?.trim().toLowerCase() ?? ''
    return createHash('sha256')
      .update(canonical({ method, route, principal, contentType }))
      .update('\0')
      .update(rawBody)
      .digest('hex')
  }
}

export function createIdempotencyMiddleware(options: IdempotencyMiddlewareOptions = {}) {
  return new IdempotencyMiddleware(options)
}

async function capture(event: H3Event, value: unknown, options: IdempotencyMiddlewareOptions): Promise<StoredResponse> {
  if (event.node.res.headersSent || event.node.res.writableEnded) throw httpError(500, 'Direct writes and streaming responses are not supported by idempotency middleware.')
  const allowed = new Set((options.replayHeaders ?? ['content-type', 'content-language', 'cache-control', 'etag', 'location']).map(h => h.toLowerCase()).filter(h => !NEVER_REPLAY.has(h)))
  const headers: Record<string, string> = {}
  for (const [name, raw] of Object.entries(event.node.res.getHeaders())) if (allowed.has(name.toLowerCase()) && raw !== undefined) headers[name.toLowerCase()] = Array.isArray(raw) ? raw.join(', ') : String(raw)
  const limit = options.maxResponseBytes ?? 1024 * 1024
  if (value instanceof Response) {
    for (const [name, raw] of value.headers) if (allowed.has(name.toLowerCase())) headers[name.toLowerCase()] = raw
    const bytes = new Uint8Array(await value.clone().arrayBuffer())
    if (bytes.byteLength > limit) throw httpError(500, 'Response is too large for idempotency replay.')
    return { kind: 'response', status: value.status, headers, body: Buffer.from(bytes).toString('base64') }
  }
  if (!isJsonSafe(value)) throw httpError(500, 'Only JSON-safe values and standard Response objects support idempotency replay.')
  let json: string
  try {
    json = JSON.stringify(value)
  }
  catch { throw httpError(500, 'Only JSON-safe values and standard Response objects support idempotency replay.') }
  if (json === undefined) throw httpError(500, 'Only JSON-safe values and standard Response objects support idempotency replay.')
  if (Buffer.byteLength(json) > limit) throw httpError(500, 'Response is too large for idempotency replay.')
  return { kind: 'json', status: event.node.res.statusCode || 200, headers, body: JSON.parse(json) }
}

function isJsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  let safe: boolean
  if (Array.isArray(value)) safe = value.every(item => isJsonSafe(item, seen))
  else if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) safe = false
  else safe = Object.values(value as Record<string, unknown>).every(item => isJsonSafe(item, seen))
  seen.delete(value)
  return safe
}

function replay(event: H3Event, response: StoredResponse): unknown {
  if (response.kind === 'response') return new Response(Buffer.from(String(response.body), 'base64'), { status: response.status, headers: response.headers })
  setResponseStatus(event, response.status)
  for (const [name, value] of Object.entries(response.headers)) if (!NEVER_REPLAY.has(name.toLowerCase())) setResponseHeader(event, name, value)
  return structuredClone(response.body)
}

function canonicalRoute(url: URL): string {
  const query = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
  const search = new URLSearchParams(query).toString()
  return search ? `${url.pathname}?${search}` : url.pathname
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}

function httpError(statusCode: number, message: string) {
  return createError({ statusCode, statusMessage: message, data: { message } })
}

function validateOptions(options: IdempotencyMiddlewareOptions): void {
  const values = {
    leaseMs: options.leaseMs ?? 30_000,
    retentionMs: options.retentionMs ?? 24 * 60 * 60 * 1000,
    heartbeatMs: options.heartbeatMs ?? Math.max(1, Math.floor((options.leaseMs ?? 30_000) / 3)),
    maxKeyBytes: options.maxKeyBytes ?? 255,
    maxBodyBytes: options.maxBodyBytes ?? 1024 * 1024,
    maxResponseBytes: options.maxResponseBytes ?? 1024 * 1024,
  }
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer.`)
  }
  if (values.heartbeatMs >= values.leaseMs) throw new TypeError('heartbeatMs must be less than leaseMs.')
}

function startHeartbeat(intervalMs: number, renew: () => Promise<void>): () => Promise<void> {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let wake: (() => void) | undefined
  const running = (async () => {
    while (!stopped) {
      await new Promise<void>((resolve) => {
        wake = resolve
        timer = setTimeout(resolve, intervalMs)
        timer.unref?.()
      })
      wake = undefined
      if (!stopped) await renew()
    }
  })()
  return async () => {
    if (!stopped) {
      stopped = true
      if (timer) clearTimeout(timer)
      wake?.()
    }
    await running
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { InboxConsumer, OutboxProcessor, createEnvelope, type InboxStore, type JsonValue, type MessageEnvelope, type OutboxStore } from '@nuxt-laravelize/reliability'

export interface WebhookTransport {
  send(url: string, init: RequestInit): Promise<Pick<Response, 'status' | 'headers'>>
}
export class FetchWebhookTransport implements WebhookTransport {
  constructor(private readonly fetcher: typeof fetch = fetch) { }
  async send(url: string, init: RequestInit) {
    return this.fetcher(url, { ...init, redirect: 'manual' })
  }
}
export type AddressResolver = (hostname: string) => Promise<readonly string[]>
const defaultResolver: AddressResolver = async hostname => (await lookup(hostname, { all: true, verbatim: true })).map(v => v.address)
function privateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]!
  if (normalized === '::1' || normalized === '::' || /^0(?::0){6}:1$/.test(normalized) || /^0(?::0){7}$/.test(normalized) || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb'))
    return true
  const dotted = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  const hexadecimal = normalized.match(/(?:^|:)ffff:([\da-f]{1,4}):([\da-f]{1,4})$/)
  const mapped = dotted ?? (hexadecimal ? `${Number.parseInt(hexadecimal[1]!, 16) >> 8}.${Number.parseInt(hexadecimal[1]!, 16) & 255}.${Number.parseInt(hexadecimal[2]!, 16) >> 8}.${Number.parseInt(hexadecimal[2]!, 16) & 255}` : undefined)
  const ip = mapped ?? normalized
  if (isIP(ip) !== 4)
    return false
  const [a = -1, b = -1] = ip.split('.').map(Number)
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224
}
export async function assertSafeWebhookUrl(value: string, resolver: AddressResolver = defaultResolver): Promise<URL> {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new TypeError('Invalid webhook URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443'))
    throw new TypeError('Webhook URL must use HTTPS without credentials, fragments or a non-standard port')
  const addresses = isIP(url.hostname) ? [url.hostname] : await resolver(url.hostname)
  if (!addresses.length || addresses.some(privateAddress))
    throw new TypeError('Webhook URL resolves to a private or invalid network')
  return url
}
export const signaturePayload = (timestamp: string, deliveryId: string, body: string) => `${timestamp}.${deliveryId}.${body}`
export function signWebhook(secret: string, timestamp: string, deliveryId: string, body: string | Uint8Array): string {
  if (secret.length < 16)
    throw new TypeError('Webhook secret is too short')
  const hmac = createHmac('sha256', secret).update(`${timestamp}.${deliveryId}.`, 'utf8')
  hmac.update(typeof body === 'string' ? body : Buffer.from(body))
  return hmac.digest('hex')
}
export function verifyWebhook(input: {
  secret: string
  timestamp: string
  deliveryId: string
  body: string | Uint8Array
  signature: string
  now?: Date
  toleranceMs?: number
}): boolean {
  if (!/^\d{10,13}$/.test(input.timestamp) || !/^[a-f\d]{64}$/i.test(input.signature))
    return false
  const milliseconds = input.timestamp.length === 10 ? Number(input.timestamp) * 1000 : Number(input.timestamp)
  if (Math.abs((input.now ?? new Date()).getTime() - milliseconds) > (input.toleranceMs ?? 300000))
    return false
  let expected: Buffer
  let supplied: Buffer
  try {
    expected = Buffer.from(signWebhook(input.secret, input.timestamp, input.deliveryId, input.body), 'hex')
    supplied = Buffer.from(input.signature, 'hex')
  }
  catch {
    return false
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
export type WebhookJob = {
  url: string
  secretId: string
  body: JsonValue
  headers?: Readonly<Record<string, string>>
}
export class WebhookSecretMissingError extends Error {
  constructor() {
    super('Webhook signing key is missing')
    this.name = 'WebhookSecretMissingError'
  }
}
export class WebhookSecretRevokedError extends Error {
  constructor() {
    super('Webhook signing key is revoked')
    this.name = 'WebhookSecretRevokedError'
  }
}
export function createWebhookEnvelope(job: WebhookJob, input: {
  id?: string
  occurredAt?: string
} = {}): MessageEnvelope {
  if (!job.secretId || typeof job.url !== 'string')
    throw new TypeError('Webhook URL and secretId are required')
  const headers = job.headers ?? {}
  const hasInvalidHeader = Object.entries(headers).some(([name, value]) => {
    const reserved = /^(?:content-type|content-length|host|authorization|cookie|x-webhook-(?:id|timestamp|signature))$/i
    return !/^[a-z0-9-]+$/i.test(name)
      || reserved.test(name)
      || typeof value !== 'string'
      || value.length > 256
      || /[\r\n]/.test(value)
  })
  if (Object.keys(headers).length > 16 || hasInvalidHeader)
    throw new TypeError('Invalid webhook headers')
  return createEnvelope({ ...input, type: 'webhook.delivery.v1', payload: job as unknown as JsonValue })
}
export type WebhookDiagnostic = Readonly<{
  deliveryId: string
  outcome: 'delivered' | 'retry' | 'dead'
  status?: number
  detail?: string
}>
const safeDetail = (value: string) => value.replace(/https?:\/\/\S+/gi, '[url]').replace(/[\r\n]/g, ' ').slice(0, 256)
function retryAfter(headers: Headers, now: Date): string | undefined {
  const value = headers.get('retry-after')
  if (!value)
    return undefined
  const seconds = Number(value)
  const date = Number.isFinite(seconds) ? new Date(now.getTime() + Math.max(0, Math.min(seconds, 86400)) * 1000) : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
export class OutgoingWebhookProcessor {
  readonly processor: OutboxProcessor
  constructor(store: OutboxStore | undefined, private readonly options: {
    owner: string
    resolveSecret: (secretId: string) => Promise<string>
    transport?: WebhookTransport
    resolver?: AddressResolver
    clock?: () => Date
    diagnostics?: (event: WebhookDiagnostic) => void
    production?: boolean
    maxAttempts?: number
    timeoutMs?: number
  }) {
    const production = options.production ?? process.env.NODE_ENV === 'production'
    if (!store || (production && store.durability !== 'durable'))
      throw new Error(production ? 'Durable webhook store is required in production' : 'Webhook store is required')
    const transport = options.transport ?? new FetchWebhookTransport()
    const clock = options.clock ?? (() => new Date())
    this.processor = new OutboxProcessor(store, async (message) => {
      const job = message.payload as unknown as WebhookJob
      let url: URL
      try {
        url = await assertSafeWebhookUrl(job.url, options.resolver)
      }
      catch (error) {
        const detail = safeDetail(error instanceof Error ? error.message : 'Unsafe webhook URL')
        options.diagnostics?.({ deliveryId: message.id, outcome: 'dead', detail })
        return { ok: false, retryable: false, error: detail }
      }
      const body = JSON.stringify(job.body)
      const timestamp = String(clock().getTime())
      let secret: string
      try {
        secret = await options.resolveSecret(job.secretId)
      }
      catch (error) {
        const terminal = error instanceof WebhookSecretMissingError || error instanceof WebhookSecretRevokedError
        return { ok: false, retryable: !terminal, error: terminal ? error.message : 'Webhook signing key store unavailable' }
      }
      const signature = signWebhook(secret, timestamp, message.id, body)
      try {
        const response = await transport.send(url.toString(), { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 10000), headers: { ...job.headers, 'content-type': 'application/json', 'user-agent': 'nuxt-laravelize-webhooks/1', 'x-webhook-id': message.id, 'x-webhook-timestamp': timestamp, 'x-webhook-signature': `v1=${signature}` }, body })
        if (response.status >= 200 && response.status < 300) {
          options.diagnostics?.({ deliveryId: message.id, outcome: 'delivered', status: response.status })
          return { ok: true }
        }
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500
        options.diagnostics?.({ deliveryId: message.id, outcome: retryable ? 'retry' : 'dead', status: response.status })
        return { ok: false, retryable, error: `Webhook HTTP ${response.status}`, ...(retryable ? { retryAt: retryAfter(response.headers, clock()) } : {}) }
      }
      catch (error) {
        const detail = safeDetail(error instanceof Error ? error.message : 'Webhook transport failed')
        options.diagnostics?.({ deliveryId: message.id, outcome: 'retry', detail })
        return { ok: false, retryable: true, error: detail }
      }
    }, { owner: options.owner, clock, types: ['webhook.delivery.v1'], maxAttempts: options.maxAttempts })
  }

  runOnce() {
    return this.processor.runOnce()
  }
}
export class WebhookInboxReceiver {
  private readonly consumer: InboxConsumer
  constructor(store: InboxStore, handler: (message: MessageEnvelope) => Promise<void>, options: {
    owner: string
    secret: string
    clock?: () => Date
    toleranceMs?: number
    production?: boolean
  }) {
    if ((options.production ?? process.env.NODE_ENV === 'production') && store.durability !== 'durable')
      throw new Error('Durable webhook inbox store is required in production')
    this.consumer = new InboxConsumer(store, handler, options)
    this.secret = options.secret
    this.clock = options.clock
    this.toleranceMs = options.toleranceMs
  }

  private readonly secret: string
  private readonly clock?: () => Date
  private readonly toleranceMs?: number
  async receive(input: {
    body: string | Uint8Array
    timestamp?: string
    deliveryId?: string
    signature?: string
  }): Promise<'delivered' | 'duplicate' | 'busy' | 'retry' | 'dead' | 'unauthorized' | 'invalid'> {
    if (!input.timestamp || !input.deliveryId || !input.signature)
      return 'unauthorized'
    const signature = input.signature.startsWith('v1=') ? input.signature.slice(3) : input.signature
    if (!verifyWebhook({ secret: this.secret, timestamp: input.timestamp, deliveryId: input.deliveryId, body: input.body, signature, now: this.clock?.(), toleranceMs: this.toleranceMs }))
      return 'unauthorized'
    let message: MessageEnvelope
    try {
      const text = typeof input.body === 'string' ? input.body : new TextDecoder('utf-8', { fatal: true }).decode(input.body)
      const parsed = JSON.parse(text) as MessageEnvelope
      if (parsed.version !== 1 || parsed.id !== input.deliveryId || typeof parsed.type !== 'string')
        return 'invalid'
      message = createEnvelope({ id: parsed.id, type: parsed.type, occurredAt: parsed.occurredAt, payload: parsed.payload, context: parsed.context })
    }
    catch {
      return 'invalid'
    }
    return this.consumer.consume(message)
  }
}

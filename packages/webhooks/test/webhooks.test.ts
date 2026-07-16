import { describe, expect, it, vi } from 'vitest'
import { InMemoryReliabilityStore } from '@nuxt-laravelize/reliability/testing'
import { assertSafeWebhookUrl, createWebhookEnvelope, OutgoingWebhookProcessor, signWebhook, verifyWebhook, WebhookInboxReceiver, WebhookSecretMissingError } from '../src/index.js'
import { WebhookTransportFake } from '../src/testing.js'

const now = new Date('2026-01-01T00:00:00.000Z')
const clock = () => now
const secret = 'a-secure-secret-value'
describe('webhooks', () => {
  it('signs the immutable raw body and rejects mutation or stale timestamps', () => {
    const timestamp = String(now.getTime())
    const signature = signWebhook(secret, timestamp, 'd-1', '{"x":1}')
    expect(verifyWebhook({ secret, timestamp, deliveryId: 'd-1', body: '{"x":1}', signature, now })).toBe(true)
    expect(verifyWebhook({ secret, timestamp, deliveryId: 'd-1', body: '{ "x":1}', signature, now })).toBe(false)
    expect(verifyWebhook({ secret, timestamp, deliveryId: 'd-1', body: '{"x":1}', signature, now: new Date(now.getTime() + 600000) })).toBe(false)
  })
  it('verifies exact bytes without normalizing invalid UTF-8', () => {
    const body = Uint8Array.from([0xFF, 0x00, 0x61])
    const timestamp = String(now.getTime())
    expect(verifyWebhook({ secret, timestamp, deliveryId: 'bytes', body, signature: signWebhook(secret, timestamp, 'bytes', body), now })).toBe(true)
  })
  it('rejects private targets including DNS rebinding candidates', async () => {
    await expect(assertSafeWebhookUrl('http://example.com')).rejects.toThrow()
    await expect(assertSafeWebhookUrl('https://hooks.example.test/x', async () => ['93.184.216.34', '127.0.0.1'])).rejects.toThrow(/private/)
  })
  it('rejects compressed and expanded IPv4-mapped IPv6 private addresses', async () => {
    await expect(assertSafeWebhookUrl('https://hooks.example.test/x', async () => ['::ffff:7f00:1'])).rejects.toThrow(/private/)
    await expect(assertSafeWebhookUrl('https://hooks.example.test/x', async () => ['0:0:0:0:0:ffff:7f00:1'])).rejects.toThrow(/private/)
  })
  it('retries 429 with Retry-After and sends without redirects', async () => {
    const store = new InMemoryReliabilityStore()
    const message = createWebhookEnvelope({ url: 'https://hooks.example.test/x', secretId: 'key-1', body: { x: 1 } }, { id: 'd-1', occurredAt: now.toISOString() })
    await store.append(message)
    const transport = new WebhookTransportFake([{ status: 429, headers: { 'retry-after': '10' } }])
    const processor = new OutgoingWebhookProcessor(store, { owner: 'w-1', resolveSecret: async () => secret, transport, resolver: async () => ['93.184.216.34'], clock })
    expect((await processor.runOnce()).retried).toBe(1)
    expect(transport.requests[0]?.init.redirect).toBe('manual')
    expect(store.records.get('outbox:d-1')?.availableAt).toBe('2026-01-01T00:00:10.000Z')
  })
  it('fails closed without a durable production store', () => {
    expect(() => new OutgoingWebhookProcessor(undefined, { owner: 'w-1', resolveSecret: async () => secret, production: true })).toThrow(/Durable/)
    expect(() => new OutgoingWebhookProcessor(new InMemoryReliabilityStore(), { owner: 'w-1', resolveSecret: async () => secret, production: true })).toThrow(/Durable/)
  })
  it('rejects reserved or injectable custom headers', () => {
    expect(() => createWebhookEnvelope({ url: 'https://example.com', secretId: 'key', body: null, headers: { authorization: 'secret' } })).toThrow(/headers/)
    expect(() => createWebhookEnvelope({ url: 'https://example.com', secretId: 'key', body: null, headers: { 'x-safe': 'ok\r\nbad' } })).toThrow(/headers/)
  })
  it('does not claim unrelated outbox messages', async () => {
    const store = new InMemoryReliabilityStore()
    await store.append({ version: 1, id: 'other', type: 'other.v1', occurredAt: now.toISOString(), payload: null })
    const processor = new OutgoingWebhookProcessor(store, { owner: 'worker', resolveSecret: async () => secret, resolver: async () => ['93.184.216.34'], clock })
    expect((await processor.runOnce()).claimed).toBe(0)
    expect(store.records.get('outbox:other')?.state).toBe('pending')
  })
  it('retries secret-store outages but terminates typed missing keys', async () => {
    const transient = new InMemoryReliabilityStore()
    await transient.append(createWebhookEnvelope({ url: 'https://hooks.example.test', secretId: 'key', body: null }, { id: 'transient', occurredAt: now.toISOString() }))
    const retrying = new OutgoingWebhookProcessor(transient, { owner: 'worker', resolveSecret: async () => {
      throw new Error('vault down')
    }, resolver: async () => ['93.184.216.34'], clock })
    expect((await retrying.runOnce()).retried).toBe(1)
    const missing = new InMemoryReliabilityStore()
    await missing.append(createWebhookEnvelope({ url: 'https://hooks.example.test', secretId: 'key', body: null }, { id: 'missing', occurredAt: now.toISOString() }))
    const terminal = new OutgoingWebhookProcessor(missing, { owner: 'worker', resolveSecret: async () => {
      throw new WebhookSecretMissingError()
    }, resolver: async () => ['93.184.216.34'], clock })
    expect((await terminal.runOnce()).dead).toBe(1)
  })
  it('verifies raw envelope and deduplicates incoming delivery', async () => {
    const store = new InMemoryReliabilityStore()
    const handler = vi.fn()
    const receiver = new WebhookInboxReceiver(store, handler, { owner: 'receiver', secret, clock })
    const envelope = { version: 1 as const, id: 'd-2', type: 'event.v1', occurredAt: now.toISOString(), payload: { x: 1 } }
    const body = JSON.stringify(envelope)
    const timestamp = String(now.getTime())
    const signature = `v1=${signWebhook(secret, timestamp, envelope.id, body)}`
    expect(await receiver.receive({ body, timestamp, deliveryId: envelope.id, signature })).toBe('delivered')
    expect(await receiver.receive({ body, timestamp, deliveryId: envelope.id, signature })).toBe('duplicate')
    expect(handler).toHaveBeenCalledOnce()
  })
})

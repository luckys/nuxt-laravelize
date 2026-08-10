import { describe, expect, it, vi } from 'vitest'
import { ConsumerFailure, createEnvelope } from '@luckys_luis/nuxt-laravelize-reliability'
import { InMemoryReliabilityStore } from '@luckys_luis/nuxt-laravelize-reliability/testing'
import type { Resolver, Token } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'
import { createQueueOutboxDelivery, DuplicateReliableHandlerError, inboxStoreToken, ReliableHandlerRegistry, reliableHandlerRegistryToken, ReliableMessageJob } from '../src/runtime/index'

describe('reliability queue', () => {
  it('rejects duplicate type and version registrations', () => {
    const registry = new ReliableHandlerRegistry()
    registry.register('order.created', 1, vi.fn())
    expect(() => registry.register('order.created', 1, vi.fn())).toThrow(DuplicateReliableHandlerError)
  })

  it('publishes with a deterministic BullMQ-safe id and aligned backoff', async () => {
    const queue = new QueueFake()
    const message = createEnvelope({ id: 'tenant:message-1', type: 'order.created', payload: null })
    const deliver = createQueueOutboxDelivery(queue, { retryDelayMs: 7000 })
    expect(await deliver(message)).toEqual({ ok: true })
    expect(await deliver(message)).toEqual({ ok: true })
    expect(queue.pushed[0]?.options.id).toMatch(/^outbox-[a-f\d]{64}$/)
    expect(queue.pushed[0]?.options.id).not.toContain(':')
    expect(queue.pushed[1]?.options.id).toBe(queue.pushed[0]?.options.id)
    expect(queue.pushed[0]?.options.backoff).toBe(7000)
  })

  it('treats oversized publication payloads as terminal', async () => {
    const queue = new QueueFake()
    const oversized = { version: 1, id: 'oversized', type: 'test', occurredAt: new Date().toISOString(), payload: 'x'.repeat(65_537) } as const
    await expect(createQueueOutboxDelivery(queue)(oversized)).resolves.toMatchObject({ ok: false, retryable: false })
    expect(queue.pushed).toHaveLength(0)
  })

  it('sets inbox retry availability to the queue backoff delay', async () => {
    const store = new InMemoryReliabilityStore()
    const registry = new ReliableHandlerRegistry()
    registry.register('retry', 1, async () => {
      throw new ConsumerFailure('temporary', true)
    })
    const resolver: Resolver = { has: () => true, make: <T>(token: Token<T>): T => {
      if (token === inboxStoreToken) return store as T
      if (token === reliableHandlerRegistryToken) return registry as T
      throw new Error('Unexpected token')
    } }
    const before = Date.now()
    const job = new ReliableMessageJob({ envelope: createEnvelope({ id: 'retry-1', type: 'retry', payload: null }), retryDelayMs: 7000 })
    await expect(job.handle(resolver)).rejects.toMatchObject({ name: 'Error' })
    const availableAt = Date.parse(store.records.get('inbox:retry-1')!.availableAt)
    expect(availableAt - before).toBeGreaterThanOrEqual(6900)
    expect(job.payload.retryDelayMs).toBe(7000)
  })

  it('applies one inbox effect when the same queue publication runs twice', async () => {
    const store = new InMemoryReliabilityStore()
    const registry = new ReliableHandlerRegistry()
    const effect = vi.fn(async () => {})
    registry.register('order.created', 1, effect)
    const resolver: Resolver = { has: () => true, make: <T>(token: Token<T>): T => {
      if (token === inboxStoreToken) return store as T
      if (token === reliableHandlerRegistryToken) return registry as T
      throw new Error('Unexpected token')
    } }
    const message = createEnvelope({ id: 'duplicate', type: 'order.created', payload: null })
    await new ReliableMessageJob({ envelope: message }).handle(resolver)
    await new ReliableMessageJob({ envelope: message }).handle(resolver)
    expect(effect).toHaveBeenCalledOnce()
  })
})

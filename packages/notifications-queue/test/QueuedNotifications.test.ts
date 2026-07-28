import { describe, expect, it, vi } from 'vitest'
import type { Resolver } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { Notification, type Notifiable } from '@nuxt-laravelize/notifications/runtime'
import { DefaultNotificationManager } from '@nuxt-laravelize/notifications/runtime'
import type { Job, PushOptions, Queue } from '@nuxt-laravelize/queue/runtime'
import { InMemoryReliabilityStore } from '@nuxt-laravelize/reliability/testing'
import { NotificationCodecRegistry, QueuedNotificationDispatcher, QueuedNotificationJob, RecipientResolverRegistry, notificationCodecRegistryToken, notificationInboxStoreToken, notificationManagerToken, notificationQueueOptionsToken, recipientResolverRegistryToken } from '../src/runtime/index'

class WelcomeNotification extends Notification {
  constructor(readonly message: string) { super() }
  via(): readonly string[] { return ['mail', 'log'] }
}

const notifiable = (id: string): Notifiable & { id: string } => ({ id, routeNotificationFor: () => 'must-not-be-serialized@example.com' })

const codecs = () => {
  const registry = new NotificationCodecRegistry()
  registry.register({ type: 'welcome', version: 1, supports: value => value instanceof WelcomeNotification, encode: value => ({ message: value.message }), decode: value => new WelcomeNotification((value as { message: string }).message) })
  return registry
}

const recipients = (resolved = notifiable('user-1')) => {
  const registry = new RecipientResolverRegistry()
  registry.register({ type: 'user', version: 1, supports: (value): value is Notifiable & { id: string } => 'id' in value, reference: value => value.id, resolve: vi.fn().mockResolvedValue({ notifiable: resolved, tenantId: 'tenant-1', locale: 'es' }) })
  return registry
}

describe('QueuedNotificationDispatcher', () => {
  it('enqueues one versioned job per recipient/channel without route PII and deterministic ids', async () => {
    const pushed: Array<{ job: Job, options?: PushOptions }> = []
    const queue = {
      push: vi.fn(async (job: Job, options?: PushOptions) => {
        pushed.push({ job, options })
        return { id: options?.id ?? 'generated', queue: 'laravelize.notifications' }
      }),
    } as unknown as Queue
    const context = ExecutionContext.create({ source: { type: 'test' }, tenantId: 'tenant-1' })
    const dispatcher = new QueuedNotificationDispatcher(queue, codecs(), recipients(), () => context)

    await dispatcher.send([notifiable('user-1'), notifiable('user-2')], new WelcomeNotification('hola'), { dispatchId: 'dispatch-1' })

    expect(pushed).toHaveLength(4)
    expect(new Set(pushed.map(item => item.options?.id)).size).toBe(4)
    expect(JSON.stringify(pushed.map(item => item.job.payload))).not.toContain('@example.com')
    expect(pushed[0]!.job.payload).toMatchObject({ version: 1, notification: { type: 'welcome', version: 1 }, recipient: { type: 'user', version: 1, id: 'user-1' }, tenantId: 'tenant-1' })
  })

  it('rejects non-json codec payloads and PII-like recipient references', async () => {
    const queue = { push: vi.fn() } as unknown as Queue
    const badCodecs = new NotificationCodecRegistry()
    badCodecs.register({ type: 'welcome', version: 1, supports: value => value instanceof WelcomeNotification, encode: () => ({ bad: undefined } as never), decode: () => new WelcomeNotification('') })
    await expect(new QueuedNotificationDispatcher(queue, badCodecs, recipients()).send(notifiable('user-1'), new WelcomeNotification('x'))).rejects.toThrow('JSON')
    await expect(new QueuedNotificationDispatcher(queue, codecs(), recipients()).send(notifiable('mail@example.com'), new WelcomeNotification('x'))).rejects.toThrow('reference')
  })

  it('isolates deterministic delivery ids by tenant', async () => {
    const ids: string[] = []
    const queue = { push: vi.fn(async (_job: Job, options?: PushOptions) => {
      ids.push(options!.id!)
      return { id: options!.id!, queue: 'laravelize.notifications' }
    }) } as unknown as Queue
    const notification = new WelcomeNotification('hola')
    const tenantOne = ExecutionContext.create({ source: { type: 'test' }, tenantId: 'tenant-1' })
    const tenantTwo = ExecutionContext.create({ source: { type: 'test' }, tenantId: 'tenant-2' })

    await new QueuedNotificationDispatcher(queue, codecs(), recipients(), () => tenantOne).send(notifiable('user-1'), notification, { dispatchId: 'same-dispatch' })
    await new QueuedNotificationDispatcher(queue, codecs(), recipients(), () => tenantTwo).send(notifiable('user-1'), notification, { dispatchId: 'same-dispatch' })

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('QueuedNotificationJob', () => {
  it('reloads recipient context and delivers only the encoded channel', async () => {
    const manager = new DefaultNotificationManager()
    const mail = { send: vi.fn().mockResolvedValue(undefined) }
    const log = { send: vi.fn().mockResolvedValue(undefined) }
    manager.register('mail', mail)
    manager.register('log', log)
    const dependencies = new Map<string, unknown>([
      [notificationCodecRegistryToken.key, codecs()],
      [recipientResolverRegistryToken.key, recipients()],
      [notificationManagerToken.key, manager],
      [executionContextToken.key, ExecutionContext.create({ source: { type: 'queue' }, tenantId: 'tenant-1' })],
    ])
    const resolver = { has: ({ key }: { key: string }) => dependencies.has(key), make: ({ key }: { key: string }) => dependencies.get(key) } as Resolver
    const job = new QueuedNotificationJob({ version: 1, deliveryId: 'delivery-1', occurredAt: new Date().toISOString(), tenantId: 'tenant-1', channel: 'mail', notification: { type: 'welcome', version: 1, payload: { message: 'hola' } }, recipient: { type: 'user', version: 1, id: 'user-1' } })

    await job.handle(resolver)

    expect(mail.send).toHaveBeenCalledWith(expect.anything(), expect.any(WelcomeNotification), expect.objectContaining({ locale: 'es', idempotencyKey: 'delivery-1', signal: expect.any(AbortSignal) }))
    expect(log.send).not.toHaveBeenCalled()
  })

  it('fails closed and non-retryably on payload and tenant mismatches', async () => {
    expect(() => new QueuedNotificationJob({ version: 2 })).toThrow('payload')
    const registry = recipients()
    const dependencies = new Map<string, unknown>([[notificationCodecRegistryToken.key, codecs()], [recipientResolverRegistryToken.key, registry], [notificationManagerToken.key, new DefaultNotificationManager()]])
    const resolver = { has: ({ key }: { key: string }) => dependencies.has(key), make: ({ key }: { key: string }) => dependencies.get(key) } as Resolver
    const job = new QueuedNotificationJob({ version: 1, deliveryId: 'd1', occurredAt: new Date().toISOString(), tenantId: 'other', channel: 'mail', notification: { type: 'welcome', version: 1, payload: { message: 'x' } }, recipient: { type: 'user', version: 1, id: 'user-1' } })
    await expect(job.handle(resolver)).rejects.toMatchObject({ name: 'NonRetryableJobError', code: 'TENANT_MISMATCH' })
  })

  it('skips recipients removed before delivery without creating a dead letter', async () => {
    const recipientRegistry = recipients()
    recipientRegistry.register({
      type: 'deleted-user',
      version: 1,
      supports: (_value): _value is Notifiable => false,
      reference: () => 'deleted',
      resolve: vi.fn().mockResolvedValue(null),
    })
    const send = vi.fn()
    const manager = new DefaultNotificationManager()
    manager.register('mail', { send })
    const dependencies = new Map<string, unknown>([
      [notificationCodecRegistryToken.key, codecs()],
      [recipientResolverRegistryToken.key, recipientRegistry],
      [notificationManagerToken.key, manager],
    ])
    const resolver = { has: ({ key }: { key: string }) => dependencies.has(key), make: ({ key }: { key: string }) => dependencies.get(key) } as Resolver
    const job = new QueuedNotificationJob({ version: 1, deliveryId: 'deleted-1', occurredAt: new Date().toISOString(), channel: 'mail', notification: { type: 'welcome', version: 1, payload: { message: 'x' } }, recipient: { type: 'deleted-user', version: 1, id: 'deleted' } })

    await expect(job.handle(resolver)).resolves.toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })

  it('uses the inbox to suppress a completed duplicate without claiming exactly-once delivery', async () => {
    const manager = new DefaultNotificationManager()
    const send = vi.fn().mockResolvedValue(undefined)
    manager.register('mail', { send })
    const dependencies = new Map<string, unknown>([
      [notificationCodecRegistryToken.key, codecs()],
      [recipientResolverRegistryToken.key, recipients()],
      [notificationManagerToken.key, manager],
      [notificationInboxStoreToken.key, new InMemoryReliabilityStore()],
      [notificationQueueOptionsToken.key, { requireDurableInbox: false }],
    ])
    const resolver = { has: ({ key }: { key: string }) => dependencies.has(key), make: ({ key }: { key: string }) => dependencies.get(key) } as Resolver
    const payload = { version: 1, deliveryId: 'deduplicated-1', occurredAt: new Date().toISOString(), tenantId: 'tenant-1', channel: 'mail', notification: { type: 'welcome', version: 1, payload: { message: 'hola' } }, recipient: { type: 'user', version: 1, id: 'user-1' } }

    await new QueuedNotificationJob(payload).handle(resolver)
    await new QueuedNotificationJob(payload).handle(resolver)

    expect(send).toHaveBeenCalledTimes(1)
  })
})

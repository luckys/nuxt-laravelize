import { describe, expect, it, vi } from 'vitest'
import { createContainer, type Resolver } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { Notification, type Notifiable } from '@nuxt-laravelize/notifications/runtime'
import { DefaultNotificationManager } from '@nuxt-laravelize/notifications/runtime'
import { InMemoryJobRegistry, InMemoryQueue, JobRunner, type Job, type PushOptions, type Queue } from '@nuxt-laravelize/queue/runtime'
import { InMemoryReliabilityStore } from '@nuxt-laravelize/reliability/testing'
import { NotificationCodecRegistry, QueuedNotificationDispatcher, QueuedNotificationJob, RecipientResolverRegistry, notificationCodecRegistryToken, notificationInboxStoreToken, notificationManagerToken, notificationQueueOptionsToken, recipientResolverRegistryToken } from '../src/runtime/index'

class WelcomeNotification extends Notification {
  constructor(readonly message: string) { super() }
  via(): readonly string[] { return ['mail', 'log'] }
}

class DelayedNotification extends Notification {
  via(): readonly string[] { return ['mail', 'log', 'database'] }
  override withDelay(notifiable: Notifiable & { id?: string }): Readonly<Record<string, number>> {
    return { mail: notifiable.id === 'user-1' ? 300_000 : 60_000, log: 0 }
  }
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
    expect(pushed.every(item => item.options?.delay === undefined)).toBe(true)
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

  it('applies validated per-recipient and per-channel delays', async () => {
    const pushed: Array<{ job: Job, options?: PushOptions }> = []
    const queue = { push: vi.fn(async (job: Job, options?: PushOptions) => {
      pushed.push({ job, options })
      return { id: options?.id ?? 'generated', queue: 'laravelize.notifications' }
    }) } as unknown as Queue
    const registry = new NotificationCodecRegistry()
    registry.register({ type: 'delayed', version: 1, supports: value => value instanceof DelayedNotification, encode: () => ({}), decode: () => new DelayedNotification() })
    const dispatcher = new QueuedNotificationDispatcher(queue, registry, recipients())

    await dispatcher.send([notifiable('user-1'), notifiable('user-2')], new DelayedNotification())

    expect(pushed.map(item => ({ channel: (item.job as QueuedNotificationJob).payload.channel, delay: item.options?.delay }))).toEqual([
      { channel: 'mail', delay: 300_000 },
      { channel: 'log', delay: 0 },
      { channel: 'database', delay: undefined },
      { channel: 'mail', delay: 60_000 },
      { channel: 'log', delay: 0 },
      { channel: 'database', delay: undefined },
    ])
  })

  it('validates delays for every recipient before enqueueing the batch', async () => {
    const queue = { push: vi.fn() } as unknown as Queue
    const registry = new NotificationCodecRegistry()
    const notification = new class extends Notification {
      via(): readonly string[] { return ['mail', 'log'] }
      override withDelay(recipient: Notifiable & { id?: string }): Readonly<Record<string, number>> {
        return { mail: 1, log: recipient.id === 'user-2' ? Number.POSITIVE_INFINITY : 1 }
      }
    }()
    registry.register({ type: 'invalid-delay', version: 1, supports: (value): value is typeof notification => value === notification, encode: () => ({}), decode: () => notification })

    await expect(new QueuedNotificationDispatcher(queue, registry, recipients()).send([notifiable('user-1'), notifiable('user-2')], notification)).rejects.toThrow('0 and 86400000')
    expect(queue.push).not.toHaveBeenCalled()
  })

  it('rejects nullish delay maps returned by an implemented withDelay method', async () => {
    for (const delays of [null, undefined]) {
      const queue = { push: vi.fn() } as unknown as Queue
      const registry = new NotificationCodecRegistry()
      const notification = new class extends Notification {
        via(): readonly string[] { return ['mail'] }
        override withDelay(): Readonly<Record<string, number>> { return delays as never }
      }()
      registry.register({ type: 'nullish-delay', version: 1, supports: (value): value is typeof notification => value === notification, encode: () => ({}), decode: () => notification })

      await expect(new QueuedNotificationDispatcher(queue, registry, recipients()).send(notifiable('user-1'), notification)).rejects.toThrow('must be an object')
      expect(queue.push).not.toHaveBeenCalled()
    }
  })
})

describe('QueuedNotificationJob', () => {
  it('reloads recipient context and delivers only the encoded channel', async () => {
    const events: unknown[] = []
    const manager = new DefaultNotificationManager(undefined, undefined, {
      dispatcher: {
        dispatch: async (event) => {
          events.push(event)
        },
      },
    })
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

    expect(mail.send).toHaveBeenCalledWith(expect.anything(), expect.any(WelcomeNotification), expect.objectContaining({ locale: 'es', idempotencyKey: 'delivery-1', occurredAt: job.payload.occurredAt, signal: expect.any(AbortSignal) }))
    expect(log.send).not.toHaveBeenCalled()
    expect(events[0]).toMatchObject({ type: 'notification.delivered', channel: 'mail', context: { idempotencyKey: 'delivery-1', locale: 'es', occurredAt: job.payload.occurredAt, tenantId: 'tenant-1' } })
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
    const events: unknown[] = []
    const manager = new DefaultNotificationManager(undefined, undefined, {
      dispatcher: {
        dispatch: async (event) => {
          events.push(event)
        },
      },
    })
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
    expect(events).toHaveLength(1)
  })

  it('emits attempt failures and eventual delivery with stable queue metadata', async () => {
    const events: unknown[] = []
    const deliveryError = new Error('provider unavailable')
    const send = vi.fn().mockRejectedValueOnce(deliveryError).mockResolvedValue(undefined)
    const manager = new DefaultNotificationManager(undefined, undefined, {
      dispatcher: {
        dispatch: async (event) => {
          events.push(event)
        },
      },
    })
    manager.register('mail', { send })
    const dependencies = new Map<string, unknown>([
      [notificationCodecRegistryToken.key, codecs()],
      [recipientResolverRegistryToken.key, recipients()],
      [notificationManagerToken.key, manager],
    ])
    const resolver = { has: ({ key }: { key: string }) => dependencies.has(key), make: ({ key }: { key: string }) => dependencies.get(key) } as Resolver
    const payload = { version: 1, deliveryId: 'retry-1', occurredAt: '2026-07-28T00:00:00.000Z', tenantId: 'tenant-1', channel: 'mail', notification: { type: 'welcome', version: 1, payload: { message: 'hola' } }, recipient: { type: 'user', version: 1, id: 'user-1' } }

    await expect(new QueuedNotificationJob(payload).handle(resolver)).rejects.toBe(deliveryError)
    await new QueuedNotificationJob(payload).handle(resolver)

    expect(events).toMatchObject([
      { type: 'notification.delivery-failed', channel: 'mail', context: { idempotencyKey: 'retry-1', occurredAt: payload.occurredAt } },
      { type: 'notification.delivered', channel: 'mail', context: { idempotencyKey: 'retry-1', occurredAt: payload.occurredAt } },
    ])
  })

  it('waits for a failed inbox claim to become retryable before the next queue attempt', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(undefined)
    const manager = new DefaultNotificationManager()
    manager.register('mail', { send })
    const container = createContainer()
    container.instance(notificationCodecRegistryToken, codecs())
    container.instance(recipientResolverRegistryToken, recipients())
    container.instance(notificationManagerToken, manager)
    container.instance(notificationInboxStoreToken, new InMemoryReliabilityStore())
    container.instance(notificationQueueOptionsToken, { requireDurableInbox: false })
    const jobs = new InMemoryJobRegistry()
    jobs.register(QueuedNotificationJob.jobName, QueuedNotificationJob)
    const queue = new InMemoryQueue(new JobRunner(container, jobs))
    const payload = { version: 1, deliveryId: 'inbox-retry-1', occurredAt: '2026-07-28T00:00:00.000Z', tenantId: 'tenant-1', channel: 'mail', notification: { type: 'welcome', version: 1, payload: { message: 'hola' } }, recipient: { type: 'user', version: 1, id: 'user-1' } }

    try {
      await queue.push(new QueuedNotificationJob(payload))
      await vi.advanceTimersByTimeAsync(0)
      expect(send).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(999)
      expect(send).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(send).toHaveBeenCalledTimes(2)
      expect(QueuedNotificationJob.backoff).toBe(1000)
    }
    finally {
      await queue.clear()
      vi.useRealTimers()
    }
  })
})

import { broadcastingManagerToken, BroadcastingManager, FailClosedBroadcaster, type BroadcastMessage, type Broadcaster } from '@luckys_luis/nuxt-laravelize-broadcasting/runtime'
import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { Notification, NotificationChannelRegistry, notificationChannelRegistryToken } from '@luckys_luis/nuxt-laravelize-notifications/runtime'
import { describe, expect, it } from 'vitest'
import { BroadcastNotificationChannel, broadcastNotificationChannelName, broadcastNotificationEvent, InvalidBroadcastNotificationError, type BroadcastNotificationJsonObject } from '../src/runtime/index'
import NotificationsBroadcastServiceProvider from '../src/runtime/server/NotificationsBroadcastServiceProvider'

class RecordingBroadcaster implements Broadcaster {
  readonly messages: BroadcastMessage[] = []
  async broadcast(message: BroadcastMessage): Promise<void> { this.messages.push(message) }
}

class BroadcastedNotification extends Notification {
  readonly secret = 'never-reflect-this'
  constructor(private readonly data: BroadcastNotificationJsonObject = { message: 'ready' }) { super() }
  via() { return ['broadcast'] }
  broadcastType() { return 'order.ready' }
  broadcastVersion() { return 2 }
  toBroadcast() { return this.data }
}

const recipient = (tenantId?: string) => ({ routeNotificationFor: () => ({ type: 'user', id: 'user-1', ...(tenantId ? { tenantId } : {}) }) })

describe('broadcast notification channel', () => {
  it('registers the opt-in channel through its service provider', () => {
    const container = createContainer()
    container.instance(notificationChannelRegistryToken, new NotificationChannelRegistry())
    container.instance(broadcastingManagerToken, new BroadcastingManager(new RecordingBroadcaster()))
    new NotificationsBroadcastServiceProvider().boot(container)
    expect([...container.make(notificationChannelRegistryToken).entries(container)]).toEqual([['broadcast', expect.any(BroadcastNotificationChannel)]])
  })

  it('broadcasts an explicit versioned envelope to one tenant-fenced private channel', async () => {
    const driver = new RecordingBroadcaster()
    const channel = new BroadcastNotificationChannel(new BroadcastingManager(driver), () => 'tenant-1')
    await channel.send(recipient('tenant-1'), new BroadcastedNotification(), { locale: 'es', idempotencyKey: 'delivery-1' })
    expect(driver.messages).toEqual([{
      channels: [{ kind: 'private', name: await broadcastNotificationChannelName({ type: 'user', id: 'user-1', tenantId: 'tenant-1' }) }],
      event: broadcastNotificationEvent,
      payload: { id: 'delivery-1', type: 'order.ready', version: 2, data: { message: 'ready' }, locale: 'es' },
    }])
    expect(JSON.stringify(driver.messages[0])).not.toContain('never-reflect-this')
  })

  it('derives stable channels that isolate tenant and recipient identity', async () => {
    const one = await broadcastNotificationChannelName({ type: 'user', id: '1', tenantId: 'one' })
    expect(one).toBe(await broadcastNotificationChannelName({ type: 'user', id: '1', tenantId: 'one' }))
    expect(one).not.toBe(await broadcastNotificationChannelName({ type: 'user', id: '1', tenantId: 'two' }))
    expect(one).not.toContain('user')
  })

  it('fails closed for spoofed or untrusted tenant routes', async () => {
    const manager = new BroadcastingManager(new RecordingBroadcaster())
    await expect(new BroadcastNotificationChannel(manager, () => 'tenant-2').send(recipient('tenant-1'), new BroadcastedNotification())).rejects.toThrow(/tenant mismatch/)
    await expect(new BroadcastNotificationChannel(manager).send(recipient('tenant-1'), new BroadcastedNotification())).rejects.toThrow(/trusted execution context/)
    await expect(new BroadcastNotificationChannel(manager, () => 'tenant-1').send(recipient('tenant-2'), new BroadcastedNotification(), { tenantId: 'tenant-2' })).rejects.toThrow(/execution tenant mismatch/)
  })

  it('rejects invalid contracts, routes, versions, data, and delivery ids before dispatch', async () => {
    const driver = new RecordingBroadcaster()
    const channel = new BroadcastNotificationChannel(new BroadcastingManager(driver))
    await expect(channel.send(recipient(), new class extends Notification {
      via() { return ['broadcast'] }
    }())).rejects.toBeInstanceOf(InvalidBroadcastNotificationError)
    await expect(channel.send({ routeNotificationFor: () => ({ type: 'user', id: '1', channel: 'public-secrets' }) }, new BroadcastedNotification())).rejects.toBeInstanceOf(InvalidBroadcastNotificationError)
    const badVersion = new class extends BroadcastedNotification {
      override broadcastVersion() { return 0 }
    }()
    await expect(channel.send(recipient(), badVersion)).rejects.toThrow(/version/)
    await expect(channel.send(recipient(), new BroadcastedNotification({ value: Number.NaN }))).rejects.toThrow(/JSON-safe/)
    await expect(channel.send(recipient(), new BroadcastedNotification(), { idempotencyKey: 'invalid delivery id' })).rejects.toThrow(/delivery id/)
    expect(driver.messages).toHaveLength(0)
  })

  it('honors aborts before provider dispatch and preserves fail-closed broadcasting', async () => {
    const driver = new RecordingBroadcaster()
    const controller = new AbortController()
    const notification = new class extends BroadcastedNotification {
      override toBroadcast() {
        controller.abort()
        return { ready: true }
      }
    }()
    await expect(new BroadcastNotificationChannel(new BroadcastingManager(driver)).send(recipient(), notification, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(driver.messages).toHaveLength(0)
    const hashingAbort = new AbortController()
    const abortingHash = async (value: Parameters<typeof broadcastNotificationChannelName>[0]) => {
      hashingAbort.abort()
      return broadcastNotificationChannelName(value)
    }
    await expect(new BroadcastNotificationChannel(new BroadcastingManager(driver), undefined, undefined, abortingHash).send(recipient(), new BroadcastedNotification(), { signal: hashingAbort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(driver.messages).toHaveLength(0)
    await expect(new BroadcastNotificationChannel(new BroadcastingManager(new FailClosedBroadcaster())).send(recipient(), new BroadcastedNotification())).rejects.toMatchObject({ name: 'BroadcastingNotConfiguredError' })
  })
})

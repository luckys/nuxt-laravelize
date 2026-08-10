import { createContainer } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { dispatcherToken } from '@luckys_luis/nuxt-laravelize-events/runtime'
import { EventFake } from '@luckys_luis/nuxt-laravelize-events/testing'
import { describe, expect, it, vi } from 'vitest'
import { DefaultNotificationManager, UnknownNotificationChannel } from '../../src/runtime/NotificationManager'
import { NotificationDelivered, NotificationDeliveryFailed } from '../../src/runtime/NotificationEvents'
import { Notification, type Notifiable } from '../../src/runtime/contracts'
import NotificationsServiceProvider from '../../src/runtime/server/NotificationsServiceProvider'
import { notificationManagerToken } from '../../src/runtime/tokens'

class WelcomeNotification extends Notification {
  via(): readonly string[] { return ['log'] }
}

describe('DefaultNotificationManager', () => {
  it('sends through registered channels', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const manager = new DefaultNotificationManager()
    manager.register('log', { send })
    const recipient: Notifiable = { routeNotificationFor: () => null }
    const notification = new WelcomeNotification()
    await manager.send(recipient, notification)
    expect(send).toHaveBeenCalledWith(recipient, notification)
  })

  it('supports on-demand routes', async () => {
    let routed: unknown
    const send = vi.fn(async (notifiable: Notifiable): Promise<void> => {
      routed = notifiable.routeNotificationFor('mail')
    })
    const manager = new DefaultNotificationManager()
    manager.register('mail', { send })
    const notification = new class extends Notification {
      via(): readonly string[] { return ['mail'] }
    }()
    await manager.route('mail', 'guest@example.com').notify(notification)
    expect(routed).toBe('guest@example.com')
  })

  it('keeps channel delays specific to queued dispatch', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const withDelay = vi.fn(() => ({ log: 60_000 }))
    const manager = new DefaultNotificationManager()
    manager.register('log', { send })
    const notification = new class extends Notification {
      via(): readonly string[] { return ['log'] }
      override withDelay = withDelay
    }()

    await manager.send({ routeNotificationFor: () => null }, notification)

    expect(send).toHaveBeenCalledOnce()
    expect(withDelay).not.toHaveBeenCalled()
  })

  it('emits bounded delivery metadata without enumerating sensitive references', async () => {
    const events = new EventFake()
    const manager = new DefaultNotificationManager(undefined, undefined, { dispatcher: events })
    manager.register('mail', { send: vi.fn().mockResolvedValue(undefined) })
    const recipient: Notifiable = { routeNotificationFor: () => 'secret@example.com' }
    const notification = new WelcomeNotification()

    await manager.sendChannel('mail', recipient, notification, {
      idempotencyKey: 'delivery-1',
      locale: 'es',
      occurredAt: '2026-07-28T00:00:00.000Z',
      tenantId: 'tenant-1',
    })

    const event = events.dispatched[0] as NotificationDelivered
    expect(event).toMatchObject({ channel: 'mail', context: { idempotencyKey: 'delivery-1', locale: 'es', occurredAt: '2026-07-28T00:00:00.000Z', tenantId: 'tenant-1' } })
    expect(event.notifiable).toBe(recipient)
    expect(event.notification).toBe(notification)
    expect(JSON.stringify(event)).not.toContain('secret@example.com')
    expect(Object.keys(event)).not.toContain('notifiable')
    expect(Object.keys(event)).not.toContain('notification')
    expect(Object.isFrozen(event.context)).toBe(true)
    expect('toPayload' in event).toBe(false)
    expect('broadcastWith' in event).toBe(false)
  })

  it('emits the original channel failure and marks aborts', async () => {
    const events = new EventFake()
    const error = new Error('provider secret response')
    const manager = new DefaultNotificationManager(undefined, undefined, { dispatcher: events })
    manager.register('mail', { send: vi.fn().mockRejectedValue(error) })

    await expect(manager.sendChannel('mail', { routeNotificationFor: () => null }, new WelcomeNotification())).rejects.toBe(error)

    const event = events.dispatched[0] as NotificationDeliveryFailed
    expect(event.error).toBe(error)
    expect(event.aborted).toBe(false)
    expect(JSON.stringify(event)).not.toContain(error.message)
    expect(Object.keys(event)).not.toContain('error')

    events.reset()
    const controller = new AbortController()
    controller.abort()
    const abortedSend = vi.fn()
    manager.register('mail', { send: abortedSend })
    await expect(manager.sendChannel('mail', { routeNotificationFor: () => null }, new WelcomeNotification(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(abortedSend).not.toHaveBeenCalled()
    expect(events.dispatched[0]).toMatchObject({ aborted: true, channel: 'mail' })
  })

  it('isolates lifecycle listener failures from delivery outcomes', async () => {
    const dispatchError = new Error('observer leaked data')
    const dispatcher = { dispatch: vi.fn().mockRejectedValue(dispatchError) }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), critical: vi.fn() }
    const manager = new DefaultNotificationManager(undefined, undefined, { dispatcher, logger })
    manager.register('mail', { send: vi.fn().mockResolvedValue(undefined) })

    await expect(manager.sendChannel('mail', { routeNotificationFor: () => null }, new WelcomeNotification())).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith('notification lifecycle listener failed', {
      channel: 'mail',
      event: 'notification.delivered',
      errorType: 'Error',
    })
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(dispatchError.message)

    const deliveryError = new Error('provider rejected request')
    manager.register('failing', { send: vi.fn().mockRejectedValue(deliveryError) })
    await expect(manager.sendChannel('failing', { routeNotificationFor: () => null }, new WelcomeNotification())).rejects.toBe(deliveryError)
    expect(logger.warn).toHaveBeenLastCalledWith('notification lifecycle listener failed', {
      channel: 'failing',
      event: 'notification.delivery-failed',
      errorType: 'Error',
    })
  })

  it('emits a failure event for unknown channels without replacing the error', async () => {
    const events = new EventFake()
    const manager = new DefaultNotificationManager(undefined, undefined, { dispatcher: events })

    await expect(manager.sendChannel('missing', { routeNotificationFor: () => null }, new WelcomeNotification())).rejects.toBeInstanceOf(UnknownNotificationChannel)

    expect(events.dispatched[0]).toBeInstanceOf(NotificationDeliveryFailed)
  })
})

describe('NotificationsServiceProvider', () => {
  it('delivers through the fallback logger when no application logger is registered', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const container = createContainer()
    new NotificationsServiceProvider().register(container)

    await container.make(notificationManagerToken).send(
      { routeNotificationFor: () => null },
      new WelcomeNotification(),
    )

    expect(info).toHaveBeenCalledWith('[INFO]', 'notification dispatched', expect.objectContaining({ channel: 'log' }))
    info.mockRestore()
  })

  it('uses an optional scoped event dispatcher', async () => {
    const events = new EventFake()
    const container = createContainer()
    container.instance(dispatcherToken, events)
    new NotificationsServiceProvider().register(container)

    await container.make(notificationManagerToken).send(
      { routeNotificationFor: () => null },
      new WelcomeNotification(),
    )

    expect(events.dispatched[0]).toBeInstanceOf(NotificationDelivered)
  })
})

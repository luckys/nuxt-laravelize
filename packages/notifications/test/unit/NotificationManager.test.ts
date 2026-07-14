import { describe, expect, it, vi } from 'vitest'
import { DefaultNotificationManager } from '../../src/runtime/NotificationManager'
import { Notification, type Notifiable } from '../../src/runtime/contracts'

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
})

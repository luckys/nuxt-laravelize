import { describe, expect, it, vi } from 'vitest'
import { PrivateChannel } from '@nuxt-laravelize/broadcasting/runtime'
import { PusherBroadcaster } from '../src/index.js'

describe('PusherBroadcaster', () => {
  it('sends signed server-side events and socket exclusion', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    const adapter = new PusherBroadcaster({ appId: 'app', key: 'key', secret: 'secret', host: 'example.test' }, fetcher)
    await adapter.broadcast({ channels: [new PrivateChannel('private-orders.1')], event: 'updated', payload: { id: 1 }, exceptSocket: '1.2' })
    expect(String(fetcher.mock.calls[0]![0])).toContain('auth_signature=')
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ socket_id: '1.2', channels: ['private-orders.1'] })
  })
  it('creates private and presence authentication signatures', () => {
    const adapter = new PusherBroadcaster({ appId: 'a', key: 'k', secret: 's' })
    expect(adapter.authorizeChannel('1.2', 'private-orders')).toHaveProperty('auth')
    expect(adapter.authorizeChannel('1.2', 'presence-room', { user_id: 'u1' })).toHaveProperty('channel_data')
  })
  it('enforces presence authorization and rejects encrypted channels', async () => {
    const adapter = new PusherBroadcaster({ appId: 'a', key: 'k', secret: 's' }, vi.fn().mockResolvedValue(new Response(null, { status: 202 })))
    expect(() => adapter.authorizeChannel('1.2', 'presence-room')).toThrow(/requires member data/)
    expect(() => adapter.authorizeChannel('1.2', 'private-room', { user_id: 'u1' })).toThrow(/cannot include/)
    expect(() => adapter.authorizeChannel('1.2', 'presence-room', { user_id: '' })).toThrow(/user_id/)
    expect(() => adapter.authorizeChannel('1.2', 'private-encrypted-room')).toThrow(/not supported/)
    await expect(adapter.broadcast({ channels: [new PrivateChannel('encrypted-room')], event: 'x', payload: {} })).rejects.toThrow(/not supported/)
  })
})

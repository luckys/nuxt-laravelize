import { describe, expect, it } from 'vitest'
import { BroadcastFake } from '../src/runtime/testing/BroadcastFake'
import { BroadcastingManager, PrivateChannel, PresenceChannel, assertJsonObject } from '../src/runtime/Broadcasting'
import { BroadcastEventListener } from '../src/runtime/EventBridge'
import { ChannelRegistry } from '../src/runtime/ChannelRegistry'
import { InMemoryBroadcaster } from '../src/runtime/InMemoryBroadcaster'

describe('broadcasting', () => {
  it('bridges eligible events with aliases, payload and socket exclusion', async () => {
    const fake = new BroadcastFake()
    const listener = new BroadcastEventListener(new BroadcastingManager(fake))
    await listener.handle({ socket: '1.2', broadcastOn: () => new PrivateChannel('orders.1'), broadcastAs: () => 'order.updated', broadcastWith: () => ({ id: 1 }), broadcastWhen: () => true, constructor: { name: 'Ignored' } })
    fake.assertBroadcast('order.updated', message => message.exceptSocket === '1.2' && message.payload.id === 1)
  })
  it('skips events when broadcastWhen is false', async () => {
    const fake = new BroadcastFake()
    await new BroadcastEventListener(new BroadcastingManager(fake)).handle({ broadcastOn: () => new PrivateChannel('x'), broadcastWith: () => ({}), broadcastWhen: () => false })
    fake.assertNothingBroadcast()
  })
  it('ignores events without an explicit payload method', async () => {
    const fake = new BroadcastFake()
    await new BroadcastEventListener(new BroadcastingManager(fake)).handle({ secret: 'do-not-reflect', broadcastOn: () => new PrivateChannel('x') })
    fake.assertNothingBroadcast()
  })
  it('rejects unsafe payloads', () => {
    expect(() => assertJsonObject({ value: Number.NaN })).toThrow(/JSON-safe/)
    expect(() => assertJsonObject({ value: undefined })).toThrow(/JSON-safe/)
  })
  it('matches placeholders, returns presence data, and denies unmatched channels', async () => {
    const registry = new ChannelRegistry<{ id: string }>().channel('presence-rooms.{room}', (user, { room }) => room === '7' ? { user_id: user.id } : false)
    expect(await registry.authorize(new PresenceChannel('rooms.7').name, { id: 'u1' })).toEqual({ authorized: true, presence: { user_id: 'u1' } })
    expect(await registry.authorize('other.7', { id: 'u1' })).toBeNull()
    expect(new PresenceChannel('rooms.7').kind).toBe('presence')
  })
  it('bounds the memory driver', async () => {
    const memory = new InMemoryBroadcaster(1)
    const message = { channels: [new PrivateChannel('x')], event: 'x', payload: {} }
    await memory.broadcast(message)
    await memory.broadcast({ ...message, event: 'y' })
    expect(memory.messages().map(item => item.event)).toEqual(['y'])
  })
  it('canonicalizes protected names and bounds depth, size, and channel count', () => {
    expect(new PrivateChannel('orders.1').name).toBe('private-orders.1')
    expect(new PresenceChannel('private-rooms.1').name).toBe('presence-rooms.1')
    let deep: Record<string, unknown> = {}
    for (let index = 0; index < 34; index++) deep = { child: deep }
    expect(() => assertJsonObject(deep)).toThrow(/maximum depth/)
    expect(() => assertJsonObject({ value: 'x'.repeat(10_001) })).toThrow(/10000 bytes/)
    expect(() => new BroadcastingManager(new BroadcastFake()).broadcast({ channels: Array.from({ length: 101 }, () => new PrivateChannel('x')), event: 'x', payload: {} })).toThrow(/100 channels/)
  })
})

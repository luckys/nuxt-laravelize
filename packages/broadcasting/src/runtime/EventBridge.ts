import type { Listener } from '@luckys_luis/nuxt-laravelize-events/runtime'
import type { BroadcastingManager, ShouldBroadcast } from './Broadcasting'
import { assertJsonObject } from './Broadcasting'

export class BroadcastEventListener implements Listener<unknown> {
  constructor(private readonly manager: BroadcastingManager) {}
  async handle(event: unknown): Promise<void> {
    if (!isBroadcastEvent(event) || (event.broadcastWhen && !await event.broadcastWhen())) return
    const channels = [event.broadcastOn()].flat()
    const payload = event.broadcastWith!()
    await this.manager.broadcast({ channels, event: event.broadcastAs?.() ?? event.constructor.name, payload: assertJsonObject(payload), exceptSocket: event.socket })
  }
}
function isBroadcastEvent(event: unknown): event is ShouldBroadcast & object {
  return typeof event === 'object' && event !== null
    && typeof (event as ShouldBroadcast).broadcastOn === 'function'
    && typeof (event as ShouldBroadcast).broadcastWith === 'function'
}

import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Listener } from '@luckys_luis/nuxt-laravelize-events/runtime'
import type { Broadcaster, BroadcastingManager } from './Broadcasting'
import type { ChannelRegistry } from './ChannelRegistry'

export const broadcasterToken = createToken<Broadcaster>('broadcasting.broadcaster')
export const broadcastingManagerToken = createToken<BroadcastingManager>('broadcasting.manager')
export const broadcastEventListenerToken = createToken<Listener<unknown>>('broadcasting.event-listener')
export const channelRegistryToken = createToken<ChannelRegistry>('broadcasting.channels')

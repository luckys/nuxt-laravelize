import { useContainer } from '@luckys_luis/nuxt-laravelize-core/runtime/server'
import { broadcastingManagerToken, channelRegistryToken } from '../tokens'
import type { BroadcastingManager } from '../Broadcasting'
import type { ChannelRegistry } from '../ChannelRegistry'

export function useBroadcasting(event: Parameters<typeof useContainer>[0]): BroadcastingManager {
  return useContainer(event).make(broadcastingManagerToken)
}
export function useBroadcastChannels(event: Parameters<typeof useContainer>[0]): ChannelRegistry {
  return useContainer(event).make(channelRegistryToken)
}
export * from '../tokens'

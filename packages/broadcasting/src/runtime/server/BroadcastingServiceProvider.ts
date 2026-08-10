import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { eventListenerRegistryToken } from '@luckys_luis/nuxt-laravelize-events/runtime'
import { BroadcastingManager, FailClosedBroadcaster } from '../Broadcasting'
import { ChannelRegistry } from '../ChannelRegistry'
import { BroadcastEventListener } from '../EventBridge'
import { InMemoryBroadcaster } from '../InMemoryBroadcaster'
import { broadcasterToken, broadcastingManagerToken, broadcastEventListenerToken, channelRegistryToken } from '../tokens'

export default class BroadcastingServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(broadcasterToken)) container.singleton(broadcasterToken, () => {
      const config = useRuntimeConfig().laravelizeBroadcasting as { driver: 'fail-closed' | 'memory', memoryCapacity: number }
      return config.driver === 'memory' ? new InMemoryBroadcaster(config.memoryCapacity) : new FailClosedBroadcaster()
    })
    container.singleton(broadcastingManagerToken, resolver => new BroadcastingManager(resolver.make(broadcasterToken)))
    container.singleton(channelRegistryToken, () => new ChannelRegistry())
    container.singleton(broadcastEventListenerToken, resolver => new BroadcastEventListener(resolver.make(broadcastingManagerToken)))
  }

  boot(container: Container): void {
    container.make(eventListenerRegistryToken).listenAny(broadcastEventListenerToken)
  }
}

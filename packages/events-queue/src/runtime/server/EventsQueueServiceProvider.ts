import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { queuedListenerAdapterToken } from '@luckys_luis/nuxt-laravelize-events/runtime'
import { jobRegistryToken, queueToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'

import { EventRegistry } from '../EventRegistry'
import { QueueListenerAdapter } from '../QueueListenerAdapter'
import { eventRegistryToken } from '../tokens'

export default class EventsQueueServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(eventRegistryToken, () => new EventRegistry())
    container.scoped(queuedListenerAdapterToken, resolver => new QueueListenerAdapter(
      resolver.make(queueToken),
      resolver.make(jobRegistryToken),
      resolver.make(eventRegistryToken),
    ))
  }
}

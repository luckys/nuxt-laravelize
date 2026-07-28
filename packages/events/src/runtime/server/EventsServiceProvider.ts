import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

import { EventListenerRegistry } from '../EventListenerRegistry'
import { InMemoryDispatcher } from '../InMemoryDispatcher'
import { dispatcherToken, eventListenerRegistryToken } from '../tokens'

export default class EventsServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(eventListenerRegistryToken, () => new EventListenerRegistry())
    container.scoped(dispatcherToken, resolver => new InMemoryDispatcher(resolver, resolver.make(eventListenerRegistryToken)))
  }
}

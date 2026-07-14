import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'

import { InMemoryDispatcher } from '../InMemoryDispatcher'
import { dispatcherToken } from '../tokens'

export default class EventsServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(dispatcherToken, resolver => new InMemoryDispatcher(resolver))
  }
}

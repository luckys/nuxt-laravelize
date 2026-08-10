import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'

import type { Dispatcher, QueuedListenerAdapter } from './contracts'
import type { EventListenerRegistry } from './EventListenerRegistry'

export const dispatcherToken = createToken<Dispatcher>('laravelize.dispatcher')
export const eventListenerRegistryToken = createToken<EventListenerRegistry>('laravelize.events.listener-registry')
export const queuedListenerAdapterToken = createToken<QueuedListenerAdapter>('laravelize.events.queued-listener-adapter')

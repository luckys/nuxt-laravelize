import { createToken } from '@nuxt-laravelize/core/runtime'

import type { Dispatcher, QueuedListenerAdapter } from './contracts'

export const dispatcherToken = createToken<Dispatcher>('laravelize.dispatcher')
export const queuedListenerAdapterToken = createToken<QueuedListenerAdapter>('laravelize.events.queued-listener-adapter')

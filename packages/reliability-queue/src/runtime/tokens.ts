import { createToken, type Token } from '@nuxt-laravelize/core/runtime'
import type { InboxStore } from '@nuxt-laravelize/reliability'
import type { ReliableHandlerRegistry } from './ReliableHandlerRegistry'

export const inboxStoreToken: Token<InboxStore> = createToken('reliability.queue.inbox-store')
export const reliableHandlerRegistryToken: Token<ReliableHandlerRegistry> = createToken('reliability.queue.handlers')

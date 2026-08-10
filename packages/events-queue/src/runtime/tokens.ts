import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { EventRegistry } from './EventRegistry'

export const eventRegistryToken = createToken<EventRegistry>('laravelize.events-queue.event-registry')

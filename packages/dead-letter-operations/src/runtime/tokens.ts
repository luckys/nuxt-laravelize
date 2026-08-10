import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { DeadLetterAdapterRegistry, DeadLetterManager } from '@luckys_luis/nuxt-laravelize-dead-letter'

export const deadLetterAdapterRegistryToken = createToken<DeadLetterAdapterRegistry>('laravelize.dead-letter-operations.adapter-registry')
export const deadLetterManagerToken = createToken<DeadLetterManager>('laravelize.dead-letter-operations.manager')

import { createToken } from '@nuxt-laravelize/core/runtime'
import type { SeederRegistry } from './SeederRegistry'

export const seederRegistryToken = createToken<SeederRegistry>('laravelize.database.seeders')

import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { SeederRegistry } from './SeederRegistry'

export const seederRegistryToken = createToken<SeederRegistry>('laravelize.database.seeders')

import { createToken } from '../../core/container/Token'
import type { SeederRegistry } from './SeederRegistry'

export const seederRegistryToken = createToken<SeederRegistry>('laravelize.database.seeders')

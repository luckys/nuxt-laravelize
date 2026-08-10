import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { FactoryRegistry } from './FactoryRegistry'

export const factoryRegistryToken = createToken<FactoryRegistry>('laravelize.database.factories')

import { createToken } from '../../core/container/Token'
import type { FactoryRegistry } from './FactoryRegistry'

export const factoryRegistryToken = createToken<FactoryRegistry>('laravelize.database.factories')

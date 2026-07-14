import { createToken } from '@nuxt-laravelize/core/runtime'
import type { PolicyRegistry } from './PolicyRegistry'

export const policyRegistryToken = createToken<PolicyRegistry>('laravelize.auth.policies')

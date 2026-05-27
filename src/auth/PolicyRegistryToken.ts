import { createToken } from '../core/container/Token'
import type { PolicyRegistry } from './PolicyRegistry'

export const policyRegistryToken = createToken<PolicyRegistry>('laravelize.auth.policies')

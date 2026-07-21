import { createToken } from '@nuxt-laravelize/core/runtime'
import type { IdempotencyStore } from './store'

export const idempotencyStoreToken = createToken<IdempotencyStore>('laravelize.idempotencyStore')

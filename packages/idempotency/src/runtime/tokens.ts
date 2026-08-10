import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { IdempotencyStore } from './store'

export const idempotencyStoreToken = createToken<IdempotencyStore>('laravelize.idempotencyStore')

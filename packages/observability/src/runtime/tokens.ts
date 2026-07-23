import { createToken } from '@nuxt-laravelize/core/runtime'
import type { Observability } from './contracts'

export const observabilityToken = createToken<Observability>('laravelize.observability')

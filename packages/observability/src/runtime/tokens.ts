import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { Observability } from './contracts'

export const observabilityToken = createToken<Observability>('laravelize.observability')

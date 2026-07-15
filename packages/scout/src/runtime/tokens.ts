import { createToken } from '@nuxt-laravelize/core/runtime'
import type { ScoutManager } from './Scout'

export const scoutManagerToken = createToken<ScoutManager>('laravelize.scoutManager')

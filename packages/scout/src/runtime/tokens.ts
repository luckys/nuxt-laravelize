import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { ScoutManager } from './Scout'

export const scoutManagerToken = createToken<ScoutManager>('laravelize.scoutManager')

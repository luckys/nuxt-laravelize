import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { FeatureManager } from './Pennant'

export const featureManagerToken = createToken<FeatureManager>('laravelize.featureManager')

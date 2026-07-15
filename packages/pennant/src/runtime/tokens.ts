import { createToken } from '@nuxt-laravelize/core/runtime'
import type { FeatureManager } from './Pennant'

export const featureManagerToken = createToken<FeatureManager>('laravelize.featureManager')

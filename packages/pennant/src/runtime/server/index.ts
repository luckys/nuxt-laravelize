import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'
import { featureManagerToken } from '../tokens'
import type { FeatureManager } from '../Pennant'

export { featureManagerToken } from '../tokens'
export function useFeatures(event: H3Event): FeatureManager {
  return useContainer(event).make(featureManagerToken)
}

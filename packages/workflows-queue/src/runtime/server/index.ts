import { useContainer } from '@nuxt-laravelize/core/runtime/server'
import { workflowCoordinatorToken } from '../tokens'

export function useWorkflows(event: Parameters<typeof useContainer>[0]) {
  return useContainer(event).make(workflowCoordinatorToken)
}

import type { H3Event } from 'h3'
import { useContainer } from '@nuxt-laravelize/core/runtime/server'
import { agentClientToken, type AgentClient } from '../index'

export function useAgentRuntime(event: H3Event): AgentClient {
  return useContainer(event).make(agentClientToken)
}

import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { AgentClient } from './types'
import type { AgentRuntimeRegistry } from './AgentRuntimeRegistry'

export const agentRuntimesToken = createToken<AgentRuntimeRegistry>('laravelize.agent.runtimes')
export const agentClientToken = createToken<AgentClient>('laravelize.agent.client')

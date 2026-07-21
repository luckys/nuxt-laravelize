import { useRuntimeConfig } from '#imports'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { AgentRuntimeRegistry, AgentSdkClient, agentClientToken, agentRuntimesToken } from '../index'

export default class AgentSdkServiceProvider implements ServiceProvider {
  register(container: Container): void {
    if (!container.has(agentRuntimesToken)) container.singleton(agentRuntimesToken, () => new AgentRuntimeRegistry())
    if (!container.has(agentClientToken)) container.scoped(agentClientToken, resolver => new AgentSdkClient(resolver.make(agentRuntimesToken), (useRuntimeConfig().laravelizeAgentSdk as { defaultRuntime: string }).defaultRuntime))
  }
}

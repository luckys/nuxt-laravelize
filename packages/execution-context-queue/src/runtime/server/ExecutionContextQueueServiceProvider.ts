import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { currentExecutionContextOptional } from '@nuxt-laravelize/execution-context/runtime/server'
import { jobMetadataContributorsToken, jobRunnerToken } from '@nuxt-laravelize/queue/runtime'
import { installExecutionContextQueuePropagation } from '../propagation'

export default class ExecutionContextQueueServiceProvider implements ServiceProvider {
  register(_container: Container): void {}

  boot(container: Container): void {
    installExecutionContextQueuePropagation(container.make(jobMetadataContributorsToken), container.make(jobRunnerToken), currentExecutionContextOptional)
  }
}

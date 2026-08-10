import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { currentExecutionContextOptional } from '@luckys_luis/nuxt-laravelize-execution-context/runtime/server'
import { jobMetadataContributorsToken, jobRunnerToken } from '@luckys_luis/nuxt-laravelize-queue/runtime'
import { installExecutionContextQueuePropagation } from '../propagation'

export default class ExecutionContextQueueServiceProvider implements ServiceProvider {
  register(_container: Container): void {}

  boot(container: Container): void {
    installExecutionContextQueuePropagation(container.make(jobMetadataContributorsToken), container.make(jobRunnerToken), currentExecutionContextOptional)
  }
}

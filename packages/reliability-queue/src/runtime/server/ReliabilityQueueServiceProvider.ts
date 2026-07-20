import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { jobRegistryToken } from '@nuxt-laravelize/queue/runtime'
import { ReliableHandlerRegistry } from '../ReliableHandlerRegistry'
import { ReliableMessageJob } from '../ReliableMessageJob'
import { reliableHandlerRegistryToken } from '../tokens'

export default class ReliabilityQueueServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(reliableHandlerRegistryToken, () => new ReliableHandlerRegistry())
  }

  boot(container: Container): void { container.make(jobRegistryToken).register(ReliableMessageJob.jobName, ReliableMessageJob) }
}

import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry } from '../JobRegistry'
import { JobRunner } from '../JobRunner'
import { InMemoryQueue } from '../InMemoryQueue'
import { jobRegistryToken, jobRunnerToken, queueToken } from '../tokens'

export default class QueueServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(jobRegistryToken, () => new InMemoryJobRegistry())
    container.singleton(jobRunnerToken, resolver => new JobRunner(container, resolver.make(jobRegistryToken)))
    container.singleton(queueToken, resolver => new InMemoryQueue(resolver.make(jobRunnerToken)))
  }
}

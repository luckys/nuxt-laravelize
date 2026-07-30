import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { InMemoryJobRegistry } from '../JobRegistry'
import { JobRunner } from '../JobRunner'
import { InMemoryQueue } from '../InMemoryQueue'
import { JobAdmissionMetadataContributorRegistry, JobMetadataContributorRegistry, JobSerializer } from '../Job'
import { jobAdmissionMetadataContributorsToken, jobMetadataContributorsToken, jobRegistryToken, jobRunnerToken, jobSerializerToken, queueToken } from '../tokens'

export default class QueueServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(jobRegistryToken, () => new InMemoryJobRegistry())
    container.singleton(jobMetadataContributorsToken, () => new JobMetadataContributorRegistry())
    container.singleton(jobAdmissionMetadataContributorsToken, () => new JobAdmissionMetadataContributorRegistry())
    container.scoped(jobSerializerToken, resolver => new JobSerializer(resolver.make(jobMetadataContributorsToken), resolver, undefined, resolver.make(jobAdmissionMetadataContributorsToken)))
    container.singleton(jobRunnerToken, resolver => new JobRunner(container, resolver.make(jobRegistryToken)))
    container.scoped(queueToken, resolver => new InMemoryQueue(resolver.make(jobRunnerToken), resolver.make(jobSerializerToken)))
  }
}

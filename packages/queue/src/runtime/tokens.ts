import { createToken } from '@nuxt-laravelize/core/runtime'
import type { Queue } from './Queue'
import type { InMemoryJobRegistry } from './JobRegistry'
import type { JobRunner } from './JobRunner'
import type { JobMetadataContributorRegistry, JobSerializer } from './Job'

export const queueToken = createToken<Queue>('laravelize.queue')
export const jobRegistryToken = createToken<InMemoryJobRegistry>('laravelize.queue.job-registry')
export const jobRunnerToken = createToken<JobRunner>('laravelize.queue.job-runner')
export const jobSerializerToken = createToken<JobSerializer>('laravelize.queue.job-serializer')
export const jobMetadataContributorsToken = createToken<JobMetadataContributorRegistry>('laravelize.queue.job-metadata-contributors')

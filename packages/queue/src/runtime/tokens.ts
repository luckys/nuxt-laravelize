import { createToken, type Token } from '@nuxt-laravelize/core/runtime'
import type { Queue } from './Queue'
import type { InMemoryJobRegistry } from './JobRegistry'
import type { JobRunner } from './JobRunner'
import type { JobAdmissionMetadataContributorRegistry, JobMetadataContributorRegistry, JobSerializer } from './Job'

export const queueToken: Token<Queue> = createToken('laravelize.queue')
export const jobRegistryToken: Token<InMemoryJobRegistry> = createToken('laravelize.queue.job-registry')
export const jobRunnerToken: Token<JobRunner> = createToken('laravelize.queue.job-runner')
export const jobSerializerToken: Token<JobSerializer> = createToken('laravelize.queue.job-serializer')
export const jobMetadataContributorsToken: Token<JobMetadataContributorRegistry> = createToken('laravelize.queue.job-metadata-contributors')
export const jobAdmissionMetadataContributorsToken: Token<JobAdmissionMetadataContributorRegistry> = createToken('laravelize.queue.job-admission-metadata-contributors')

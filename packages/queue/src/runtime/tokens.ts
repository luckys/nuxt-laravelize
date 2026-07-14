import { createToken } from '@nuxt-laravelize/core/runtime'
import type { Queue } from './Queue'
import type { InMemoryJobRegistry } from './JobRegistry'
import type { JobRunner } from './JobRunner'

export const queueToken = createToken<Queue>('laravelize.queue')
export const jobRegistryToken = createToken<InMemoryJobRegistry>('laravelize.queue.job-registry')
export const jobRunnerToken = createToken<JobRunner>('laravelize.queue.job-runner')

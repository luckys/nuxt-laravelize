import { createToken } from '../core/container/Token'

import type { JobRegistry } from './JobRegistry'

export const jobRegistryToken = createToken<JobRegistry>('laravelize.job-registry')

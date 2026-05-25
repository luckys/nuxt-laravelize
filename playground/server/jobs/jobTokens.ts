import { createToken } from '../../../src/core/container/Token'
import type { Job } from '../../../src/queue/Job'

export const processVideoJobToken = createToken<Job>('playground.job.process-video')

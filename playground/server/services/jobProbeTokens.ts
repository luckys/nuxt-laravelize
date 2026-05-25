import { createToken } from '../../../src/core/container/Token'

export interface JobProbeContract {
  recordProcessed(videoId: string): void
  recordFailure(videoId: string, message: string): void
  snapshot(): { processed: string[], failures: Array<{ videoId: string, message: string }> }
}

export const jobProbeToken = createToken<JobProbeContract>('playground.job-probe')

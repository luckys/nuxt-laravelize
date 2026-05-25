import { Job } from '../../../src/queue/Job'

import type { JobProbeContract } from '../services/jobProbeTokens'

let probeRef: JobProbeContract | null = null

export function bindProcessVideoJobProbe(probe: JobProbeContract): void {
  probeRef = probe
}

export class ProcessVideoJob extends Job {
  static override readonly tries = 3
  static override readonly queue = 'default'

  constructor(public readonly videoId: string) { super() }

  handle(): void {
    if (!probeRef) throw new Error('ProcessVideoJob probe not bound')
    if (this.videoId === 'fail-always') {
      probeRef.recordFailure(this.videoId, 'always fails')
      throw new Error('always fails')
    }
    probeRef.recordProcessed(this.videoId)
  }

  serialize(): { name: string, args: readonly unknown[] } {
    return { name: 'ProcessVideoJob', args: [this.videoId] }
  }
}

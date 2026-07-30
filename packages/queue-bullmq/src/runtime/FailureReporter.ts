import type { FailedJobCallback, FailedJobInfo, Job } from '@nuxt-laravelize/queue/runtime'

export class FailureReporter {
  readonly #callbacks: FailedJobCallback[] = []
  listen(callback: FailedJobCallback): void { this.#callbacks.push(callback) }
  async report(info: FailedJobInfo, freshJob?: () => Job): Promise<void> {
    for (const callback of this.#callbacks) {
      try {
        await callback(freshJob ? { ...info, job: freshJob() } : info)
      }
      catch { /* Failure observers cannot alter worker completion. */ }
    }
  }
}

import type { FailedJobCallback, FailedJobInfo } from '@nuxt-laravelize/queue/runtime'

export class FailureReporter {
  readonly #callbacks: FailedJobCallback[] = []
  listen(callback: FailedJobCallback): void { this.#callbacks.push(callback) }
  async report(info: FailedJobInfo): Promise<void> {
    for (const callback of this.#callbacks) {
      try {
        await callback(info)
      }
      catch { /* Failure observers cannot alter worker completion. */ }
    }
  }
}

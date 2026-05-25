import type { JobProbeContract } from './jobProbeTokens'

export class JobProbe implements JobProbeContract {
  readonly #processed: string[] = []
  readonly #failures: Array<{ videoId: string, message: string }> = []

  recordProcessed(videoId: string): void {
    this.#processed.push(videoId)
  }

  recordFailure(videoId: string, message: string): void {
    this.#failures.push({ videoId, message })
  }

  snapshot(): { processed: string[], failures: Array<{ videoId: string, message: string }> } {
    return { processed: [...this.#processed], failures: [...this.#failures] }
  }
}

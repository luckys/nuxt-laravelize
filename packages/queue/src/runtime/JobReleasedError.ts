const MAX_RELEASE_DELAY = 86_400_000
const MAX_RELEASES = 100_000

export class JobReleasedError extends Error {
  constructor(readonly delay: number, readonly maxReleases = 1000, options?: ErrorOptions) {
    if (!Number.isSafeInteger(delay) || delay < 1 || delay > MAX_RELEASE_DELAY) throw new TypeError(`Job release delay must be an integer between 1 and ${MAX_RELEASE_DELAY}`)
    if (!Number.isSafeInteger(maxReleases) || maxReleases < 1 || maxReleases > MAX_RELEASES) throw new TypeError(`Maximum job releases must be an integer between 1 and ${MAX_RELEASES}`)
    super(`Job was released for ${delay} milliseconds.`, options)
    this.name = 'JobReleasedError'
  }
}

export function isJobReleasedError(error: unknown): error is JobReleasedError {
  return error instanceof JobReleasedError
}

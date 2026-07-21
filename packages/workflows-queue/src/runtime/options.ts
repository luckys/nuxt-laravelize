export interface WorkflowsQueueOptions {
  queue?: string
  tries?: number
  backoff?: number | readonly number[]
  contentionDelayMs?: number
  maxDelayMs?: number
}

export interface ResolvedWorkflowsQueueOptions {
  readonly queue: string
  readonly tries: number
  readonly backoff: number | readonly number[]
  readonly contentionDelayMs: number
  readonly maxDelayMs: number
}

export function resolveWorkflowsQueueOptions(options: WorkflowsQueueOptions = {}): ResolvedWorkflowsQueueOptions {
  const queue = options.queue ?? 'default'
  if (typeof queue !== 'string' || !queue.trim()) throw new TypeError('queue must be a non-empty string')
  return {
    queue,
    tries: integer(options.tries ?? 3, 'tries', 1, 1000),
    backoff: backoff(options.backoff ?? 5000),
    contentionDelayMs: integer(options.contentionDelayMs ?? 1000, 'contentionDelayMs', 0, 86_400_000),
    maxDelayMs: integer(options.maxDelayMs ?? 86_400_000, 'maxDelayMs', 1, 86_400_000),
  }
}

function integer(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}`)
  return value
}
function backoff(value: number | readonly number[]): number | readonly number[] {
  if (Array.isArray(value) && value.length === 0) throw new TypeError('backoff must not be empty')
  for (const delay of typeof value === 'number' ? [value] : value) integer(delay, 'backoff', 0, 86_400_000)
  return value
}

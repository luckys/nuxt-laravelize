import { defineTask, runTask } from 'nitro/task'

export interface ScheduledOperation<TResult = unknown> {
  execute(payload: Record<string, unknown>): TResult | Promise<TResult>
}

export function defineScheduledOperation<TResult>(name: string, operation: ScheduledOperation<TResult>, description?: string) {
  return defineTask({
    meta: { name, description },
    async run({ payload }) {
      return { result: await operation.execute(payload) }
    },
  })
}

export function runScheduledTask(name: string, payload: Record<string, unknown> = {}) {
  return runTask(name, { payload })
}

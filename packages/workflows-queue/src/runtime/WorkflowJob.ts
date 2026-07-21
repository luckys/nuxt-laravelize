import type { Resolver } from '@nuxt-laravelize/core/runtime'
import { Job } from '@nuxt-laravelize/queue/runtime'
import { workflowCoordinatorToken } from './tokens'

export class WorkflowJob extends Job<{ workflowId: string }> {
  static override readonly jobName = 'nuxt-laravelize.workflow.v1'
  readonly payload: { workflowId: string }

  constructor(payload: Record<string, unknown>) {
    super()
    if (Object.keys(payload).length !== 1 || typeof payload.workflowId !== 'string' || !payload.workflowId) throw new TypeError('WorkflowJob requires only a non-empty workflowId')
    this.payload = { workflowId: payload.workflowId }
  }

  handle(resolver: Resolver): Promise<void> {
    return resolver.make(workflowCoordinatorToken).process(this.payload.workflowId)
  }
}

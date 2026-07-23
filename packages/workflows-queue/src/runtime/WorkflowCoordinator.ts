import { createHash } from 'node:crypto'
import type { Queue, JobHandle, PushOptions } from '@nuxt-laravelize/queue/runtime'
import { isRecoverableWorkflowStore, isWorkflowTerminal, isWorkflowWaiting, type JsonValue, type WorkflowDefinition, type WorkflowManager, type WorkflowRecoveryCursor, type WorkflowSnapshot, type WorkflowStore, workflowNextRetryAt } from '@nuxt-laravelize/workflows'
import { WorkflowJob } from './WorkflowJob'
import type { ResolvedWorkflowsQueueOptions } from './options'

export interface WorkflowReconcileResult {
  scheduled: string[]
  skipped: string[]
  failed: Array<{ workflowId: string, error: unknown }>
}

export interface WorkflowStoreReconcileOptions { pageSize?: number, updatedBefore?: number }

export class WorkflowCoordinator {
  constructor(
    private readonly store: WorkflowStore,
    private readonly manager: WorkflowManager,
    private readonly queue: Queue,
    private readonly options: ResolvedWorkflowsQueueOptions,
    private readonly now: () => number = Date.now,
  ) {}

  async start<I extends JsonValue>(definition: WorkflowDefinition<I>, input: I, startKey: string): Promise<WorkflowSnapshot> {
    const snapshot = await this.manager.start(definition, input, startKey)
    await this.enqueue(snapshot.id)
    return snapshot
  }

  /** Reloads the authoritative revision before every publication. */
  async enqueue(workflowId: string, delayMs = 0): Promise<JobHandle | null> {
    const snapshot = await this.required(workflowId)
    this.manager.assertProcessable(snapshot)
    if (isWorkflowTerminal(snapshot)) return null
    const pushOptions = this.pushOptions(snapshot)
    const job = new WorkflowJob({ workflowId })
    return delayMs > 0 ? this.queue.later(delayMs, job, pushOptions) : this.queue.push(job, pushOptions)
  }

  /** Recovery hook for scanners backed by an application's durable workflow index. */
  async reconcile(workflowIds: Iterable<string> | AsyncIterable<string>): Promise<WorkflowReconcileResult> {
    const result: WorkflowReconcileResult = { scheduled: [], skipped: [], failed: [] }
    for await (const workflowId of workflowIds) {
      try {
        const handle = await this.enqueue(workflowId)
        if (handle) result.scheduled.push(workflowId)
        else result.skipped.push(workflowId)
      }
      catch (error) { result.failed.push({ workflowId, error }) }
    }
    return result
  }

  /** Runs one bounded recovery pass when the configured store supports discovery. */
  async reconcileStore(options: WorkflowStoreReconcileOptions = {}): Promise<WorkflowReconcileResult> {
    if (!isRecoverableWorkflowStore(this.store)) throw new TypeError('Workflow store does not support recovery discovery')
    const updatedBefore = options.updatedBefore ?? this.now()
    const result: WorkflowReconcileResult = { scheduled: [], skipped: [], failed: [] }
    let cursor: WorkflowRecoveryCursor | undefined
    do {
      const page = await this.store.discoverRecoverable({ updatedBefore, cursor, limit: options.pageSize })
      const reconciled = await this.reconcile(page.workflowIds)
      result.scheduled.push(...reconciled.scheduled)
      result.skipped.push(...reconciled.skipped)
      result.failed.push(...reconciled.failed)
      cursor = page.nextCursor
    } while (cursor)
    return result
  }

  async process(workflowId: string): Promise<void> {
    const result = await this.manager.processResult(workflowId)
    if (result.outcome === 'terminal') return
    if (result.outcome === 'contended') {
      await this.enqueue(workflowId, this.options.contentionDelayMs)
      return
    }
    const snapshot = result.snapshot
    if (isWorkflowTerminal(snapshot)) return
    if (isWorkflowWaiting(snapshot)) {
      const retryAt = workflowNextRetryAt(snapshot)
      await this.enqueue(workflowId, Math.min(this.options.maxDelayMs, Math.max(0, (retryAt ?? this.now()) - this.now())))
      return
    }
    await this.enqueue(workflowId)
  }

  private pushOptions(snapshot: WorkflowSnapshot): PushOptions {
    return { id: workflowJobId(snapshot.id, snapshot.revision), queue: this.options.queue, tries: this.options.tries, backoff: this.options.backoff }
  }

  private async required(id: string): Promise<WorkflowSnapshot> {
    const snapshot = await this.store.get(id)
    if (!snapshot) throw new Error(`Workflow not found: ${id}`)
    return snapshot
  }
}

export function workflowJobId(workflowId: string, revision: number): string {
  return `workflow-${createHash('sha256').update(`${workflowId}\u0000${revision}`).digest('hex')}`
}

import type { TransactionManager, UnitOfWork } from '@nuxt-laravelize/database/runtime'
import { createEnvelope, type MessageEnvelope, type MessageExecutionContext, type OutboxAppendOptions } from '@nuxt-laravelize/reliability'
import { isWorkflowTerminal, isWorkflowWaiting, type WorkflowManager, type WorkflowSnapshot, type WorkflowStore, workflowNextRetryAt } from '@nuxt-laravelize/workflows'

export const workflowWakeMessageType = 'laravelize.workflow.wake.v1'
export type WorkflowWakePayload = { workflowId: string }
export type WorkflowWakeReason = 'start' | 'lease-expired' | 'transition' | 'cancellation'

export interface WorkflowWakeHandlerRegistrar {
  register(type: string, version: number, handler: (message: MessageEnvelope, context: MessageExecutionContext) => void | Promise<void>): void
}

export interface TransactionalOutboxAppender<Session> {
  appendIn(unitOfWork: UnitOfWork<Session>, envelope: MessageEnvelope, options?: OutboxAppendOptions): Promise<void>
}

export interface TransactionalWorkflowStoreOptions<Session> {
  transactions: TransactionManager<Session>
  readStore: WorkflowStore
  storeForSession: (session: Session) => WorkflowStore
  outbox: TransactionalOutboxAppender<Session>
  idFactory?: () => string
}

const timestamp = (epoch: number, name: string): string => {
  if (!Number.isSafeInteger(epoch) || Math.abs(epoch) > 8_640_000_000_000_000) throw new TypeError(`${name} is outside the supported Date range`)
  return new Date(epoch).toISOString()
}

export class TransactionalWorkflowStore<Session> implements WorkflowStore {
  private readonly idFactory: () => string

  constructor(private readonly options: TransactionalWorkflowStoreOptions<Session>) {
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID())
  }

  get(id: string) { return this.options.readStore.get(id) }

  create(snapshot: WorkflowSnapshot) {
    return this.options.transactions.transaction(unitOfWork => this.in(unitOfWork).create(snapshot))
  }

  claim(id: string, expectedRevision: number, token: string, now: number, expiresAt: number) {
    return this.options.transactions.transaction(unitOfWork => this.in(unitOfWork).claim(id, expectedRevision, token, now, expiresAt))
  }

  commit(snapshot: WorkflowSnapshot, expectedRevision: number, leaseToken: string, now: number, releaseLease = true) {
    return this.options.transactions.transaction(unitOfWork => this.in(unitOfWork).commit(snapshot, expectedRevision, leaseToken, now, releaseLease))
  }

  requestCancellation(id: string, expectedRevision: number, now: number) {
    return this.options.transactions.transaction(unitOfWork => this.in(unitOfWork).requestCancellation(id, expectedRevision, now))
  }

  /** Joins a caller-owned unit of work without opening a nested transaction. */
  in(unitOfWork: UnitOfWork<Session>): WorkflowStore {
    const store = this.options.storeForSession(unitOfWork.session)
    return {
      get: id => store.get(id),
      create: async (snapshot) => {
        const result = await store.create(snapshot)
        if (result.created) await this.append(unitOfWork, result.snapshot, 'start', result.snapshot.updatedAt)
        return result
      },
      claim: async (id, expectedRevision, token, now, expiresAt) => {
        const claimed = await store.claim(id, expectedRevision, token, now, expiresAt)
        await this.append(unitOfWork, claimed, 'lease-expired', now, expiresAt)
        return claimed
      },
      commit: async (snapshot, expectedRevision, leaseToken, now, releaseLease = true) => {
        const committed = await store.commit(snapshot, expectedRevision, leaseToken, now, releaseLease)
        if (releaseLease && !isWorkflowTerminal(committed)) {
          const availableAt = isWorkflowWaiting(committed) ? workflowNextRetryAt(committed) ?? now : now
          await this.append(unitOfWork, committed, 'transition', now, availableAt)
        }
        return committed
      },
      requestCancellation: async (id, expectedRevision, now) => {
        const cancelled = await store.requestCancellation(id, expectedRevision, now)
        if (!isWorkflowTerminal(cancelled)) await this.append(unitOfWork, cancelled, 'cancellation', now)
        return cancelled
      },
    }
  }

  private async append(unitOfWork: UnitOfWork<Session>, snapshot: WorkflowSnapshot, reason: WorkflowWakeReason, occurredAt: number, availableAt = occurredAt): Promise<void> {
    const envelope = createEnvelope<WorkflowWakePayload>({
      id: this.idFactory(),
      type: workflowWakeMessageType,
      occurredAt: timestamp(occurredAt, 'occurredAt'),
      payload: { workflowId: snapshot.id },
    })
    await this.options.outbox.appendIn(unitOfWork, envelope, { availableAt: timestamp(availableAt, `${reason}.availableAt`) })
  }
}

export function createWorkflowWakeHandler(manager: WorkflowManager): (message: MessageEnvelope) => Promise<void> {
  return async (message) => {
    const payload = message.payload as Record<string, unknown> | null
    if (message.type !== workflowWakeMessageType || !payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1 || typeof payload.workflowId !== 'string' || !payload.workflowId)
      throw new TypeError('Invalid workflow wake message')
    await manager.processResult(payload.workflowId)
  }
}

export function registerWorkflowWakeHandler(registrar: WorkflowWakeHandlerRegistrar, manager: WorkflowManager): void {
  registrar.register(workflowWakeMessageType, 1, createWorkflowWakeHandler(manager))
}

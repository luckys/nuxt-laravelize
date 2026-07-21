import { describe, expect, it, vi } from 'vitest'
import type { Resolver, Token } from '@nuxt-laravelize/core/runtime'
import type { TransactionManager, UnitOfWork } from '@nuxt-laravelize/database/runtime'
import { QueueFake } from '@nuxt-laravelize/queue/testing'
import { OutboxProcessor } from '@nuxt-laravelize/reliability'
import { createQueueOutboxDelivery, inboxStoreToken, ReliableHandlerRegistry, reliableHandlerRegistryToken, ReliableMessageJob } from '@nuxt-laravelize/reliability-queue/runtime'
import { InMemoryReliabilityStore } from '@nuxt-laravelize/reliability/testing'
import { defineStep, defineWorkflow, InMemoryWorkflowStore, WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
import { registerWorkflowWakeHandler, TransactionalWorkflowStore } from '../src/index.js'

describe('workflow wake-up delivery', () => {
  it('runs authoritative transitions through outbox, queue, and inbox', async () => {
    const workflowState = new InMemoryWorkflowStore()
    const messages = new InMemoryReliabilityStore()
    const unitOfWork: UnitOfWork<{ workflowState: InMemoryWorkflowStore }> = {
      session: { workflowState },
      afterCommit: () => {},
    }
    const transactions: TransactionManager<typeof unitOfWork.session> = {
      transaction: async work => await work(unitOfWork),
    }
    let wakeId = 0
    const store = new TransactionalWorkflowStore({
      transactions,
      readStore: workflowState,
      storeForSession: session => session.workflowState,
      outbox: { appendIn: async (_current, envelope, options) => await messages.append(envelope, options) },
      idFactory: () => `wake-${++wakeId}`,
    })
    const definition = defineWorkflow({ name: 'delivery', version: '1', steps: [defineStep({ name: 'finish', run: () => 'done' })] })
    const manager = new WorkflowManager(store, new WorkflowRegistry().register(definition), {
      idFactory: () => 'workflow-1',
      tokenFactory: () => 'lease-1',
      clock: { now: () => 100 },
    })
    const processResult = vi.spyOn(manager, 'processResult')
    const handlers = new ReliableHandlerRegistry()
    registerWorkflowWakeHandler(handlers, manager)

    const started = await manager.start(definition, {}, 'delivery-1')
    const queue = new QueueFake()
    const processor = new OutboxProcessor(messages, createQueueOutboxDelivery(queue), {
      owner: 'outbox-worker',
      clock: () => new Date(100),
    })
    const summary = await processor.runOnce()

    expect(summary.delivered).toBe(1)
    expect(queue.pushed).toHaveLength(1)
    const job = queue.pushed[0]!.job
    expect(job).toBeInstanceOf(ReliableMessageJob)
    if (!(job instanceof ReliableMessageJob)) throw new TypeError('Expected a reliable message job')
    const resolver: Resolver = {
      has: () => true,
      make: <T>(token: Token<T>): T => {
        if (token === inboxStoreToken) return messages as T
        if (token === reliableHandlerRegistryToken) return handlers as T
        throw new Error('Unexpected token')
      },
    }

    await job.handle(resolver)
    expect((await manager.status(started.id))?.state).toBe('running')
    await job.handle(resolver)
    expect(processResult).toHaveBeenCalledOnce()

    expect((await processor.runOnce()).delivered).toBe(1)
    expect(queue.pushed).toHaveLength(2)
    const completionJob = queue.pushed[1]!.job
    if (!(completionJob instanceof ReliableMessageJob)) throw new TypeError('Expected a reliable message job')
    await completionJob.handle(resolver)
    expect((await manager.status(started.id))?.state).toBe('completed')
    await completionJob.handle(resolver)
    expect(processResult).toHaveBeenCalledTimes(2)
  })
})

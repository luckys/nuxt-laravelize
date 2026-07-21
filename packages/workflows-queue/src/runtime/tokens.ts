import { createToken, type Token } from '@nuxt-laravelize/core/runtime'
import type { WorkflowManager, WorkflowRegistry, WorkflowStore } from '@nuxt-laravelize/workflows'
import type { WorkflowCoordinator } from './WorkflowCoordinator'
import type { ResolvedWorkflowsQueueOptions } from './options'

export const workflowStoreToken: Token<WorkflowStore> = createToken('laravelize.workflows.store')
export const workflowRegistryToken: Token<WorkflowRegistry> = createToken('laravelize.workflows.registry')
export const workflowManagerToken: Token<WorkflowManager> = createToken('laravelize.workflows.manager')
export const workflowCoordinatorToken: Token<WorkflowCoordinator> = createToken('laravelize.workflows-queue.coordinator')
export const workflowsQueueOptionsToken: Token<ResolvedWorkflowsQueueOptions> = createToken('laravelize.workflows-queue.options')

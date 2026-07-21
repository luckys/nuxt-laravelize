import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { jobRegistryToken, queueToken } from '@nuxt-laravelize/queue/runtime'
import { WorkflowManager, WorkflowRegistry } from '@nuxt-laravelize/workflows'
import { WorkflowCoordinator } from '../WorkflowCoordinator'
import { WorkflowJob } from '../WorkflowJob'
import { resolveWorkflowsQueueOptions, type ResolvedWorkflowsQueueOptions, type WorkflowsQueueOptions } from '../options'
import { workflowCoordinatorToken, workflowManagerToken, workflowRegistryToken, workflowsQueueOptionsToken, workflowStoreToken } from '../tokens'

export default class WorkflowsQueueServiceProvider implements ServiceProvider {
  private readonly options: ResolvedWorkflowsQueueOptions

  constructor(options: WorkflowsQueueOptions = {}) { this.options = resolveWorkflowsQueueOptions(options) }

  register(container: Container): void {
    container.instance(workflowsQueueOptionsToken, this.options)
    container.singleton(workflowRegistryToken, () => new WorkflowRegistry())
    // Deliberately no workflowStoreToken binding: applications must provide a durable authoritative store.
    container.scoped(workflowManagerToken, resolver => new WorkflowManager(resolver.make(workflowStoreToken), resolver.make(workflowRegistryToken)))
    container.scoped(workflowCoordinatorToken, resolver => new WorkflowCoordinator(
      resolver.make(workflowStoreToken), resolver.make(workflowManagerToken), resolver.make(queueToken), resolver.make(workflowsQueueOptionsToken),
    ))
  }

  boot(container: Container): void { container.make(jobRegistryToken).register(WorkflowJob.jobName, WorkflowJob) }
}

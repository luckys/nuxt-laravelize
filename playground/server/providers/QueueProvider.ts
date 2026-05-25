import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { InMemoryJobRegistry } from '../../../src/queue/InMemoryJobRegistry'
import { InMemoryQueue } from '../../../src/queue/InMemoryQueue'
import { jobRegistryToken } from '../../../src/queue/JobRegistryToken'
import { ListenerJob } from '../../../src/queue/ListenerJob'
import { queueToken } from '../../../src/queue/QueueToken'

import { UserRegistered } from '../events/UserRegistered'
import { bindProcessVideoJobProbe, ProcessVideoJob } from '../jobs/ProcessVideoJob'
import { processVideoJobToken } from '../jobs/jobTokens'
import { JobProbe } from '../services/JobProbe'
import { jobProbeToken } from '../services/jobProbeTokens'

export default class QueueProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(jobProbeToken, () => new JobProbe())
    container.singleton(jobRegistryToken, () => {
      const registry = new InMemoryJobRegistry()
      registry.registerJob('laravelize.ListenerJob', ListenerJob)
      registry.registerJob('ProcessVideoJob', ProcessVideoJob)
      registry.registerEvent('UserRegistered', UserRegistered)
      return registry
    })
    container.singleton(queueToken, resolver => new InMemoryQueue(resolver, resolver.make(jobRegistryToken)))
    container.bind(processVideoJobToken, () => new ProcessVideoJob(''))
  }

  boot(container: Container): void {
    bindProcessVideoJobProbe(container.make(jobProbeToken))
  }
}

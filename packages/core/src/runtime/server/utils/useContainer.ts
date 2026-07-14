import type { H3Event } from 'h3'

import type { Container } from '../../../core/container/Container'
import { ContainerNotAvailableError } from '../../../core/container/ContainerErrors'

export function useContainer(event: H3Event): Container {
  const container = event.context.laravelizeContainer
  if (!container) {
    throw new ContainerNotAvailableError()
  }

  return container
}

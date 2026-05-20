import type { H3Event } from 'h3'

import { ContainerNotAvailableError } from '../../../core/container/ContainerErrors'

export function useContainer(_event: H3Event): never {
  throw new ContainerNotAvailableError()
}

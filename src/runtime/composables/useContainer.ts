import { ContainerNotAvailableError } from '../../core/container/ContainerErrors'

export function useContainer(): never {
  throw new ContainerNotAvailableError()
}

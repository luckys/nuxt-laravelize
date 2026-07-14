import { useNuxtApp } from '#app'

import type { Container } from '../../core/container/Container'
import { ContainerNotAvailableError } from '../../core/container/ContainerErrors'

export function useContainer(): Container {
  const nuxtApp = useNuxtApp()
  const container = nuxtApp.$laravelizeContainer
  if (!container) {
    throw new ContainerNotAvailableError()
  }

  return container
}

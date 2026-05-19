import { useRequestEvent } from '#app'

import type { NuxtLaravelizeContainer } from '../../core/container/NuxtLaravelizeContainer'

export function useContainer() {
  const event = useRequestEvent()

  if (!event?.context.laravelizeContainer) {
    throw new Error('Laravelize container is not available in this context')
  }

  return event.context.laravelizeContainer as NuxtLaravelizeContainer
}

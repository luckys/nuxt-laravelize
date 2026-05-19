import type { NuxtLaravelizeContainer } from '../../../core/container/NuxtLaravelizeContainer'

type RequestLike = {
  context: {
    laravelizeContainer?: unknown
  }
}

export function useContainer(event: RequestLike) {
  if (!event.context.laravelizeContainer) {
    throw new Error('Laravelize container is not attached to the request context')
  }

  return event.context.laravelizeContainer as NuxtLaravelizeContainer
}

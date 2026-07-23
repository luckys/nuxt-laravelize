import type { H3Event } from 'h3'
import { authorizationToken, type Authorization } from '../index'

export function useAuthorization(event: H3Event): Authorization {
  if (!event.context.laravelizeContainer) throw new Error('Laravelize request scope is unavailable')
  return event.context.laravelizeContainer.make(authorizationToken)
}

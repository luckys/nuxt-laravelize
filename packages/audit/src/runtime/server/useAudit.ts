import type { H3Event } from 'h3'
import { auditRecorderToken, type DefaultAuditRecorder } from '../index'

export function useAudit(event: H3Event): DefaultAuditRecorder {
  if (!event.context.laravelizeContainer) throw new Error('Laravelize request scope is unavailable')
  return event.context.laravelizeContainer.make(auditRecorderToken)
}

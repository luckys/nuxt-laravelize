import type { LogContext, Logger } from '@nuxt-laravelize/core/runtime'
import type { ExecutionContext } from './ExecutionContext'

const fields = (context: ExecutionContext): LogContext => {
  const value = context.snapshot()
  return { executionId: value.executionId, correlationId: value.correlationId, ...(value.causationId ? { causationId: value.causationId } : {}), ...(value.tenantId ? { tenantId: value.tenantId } : {}), source: value.source.type }
}
export function withExecutionContext(logger: Logger, executionContext: ExecutionContext): Logger {
  const trusted = fields(executionContext)
  return { debug: (message, context) => logger.debug(message, { ...context, ...trusted }), info: (message, context) => logger.info(message, { ...context, ...trusted }), warn: (message, context) => logger.warn(message, { ...context, ...trusted }), error: (message, context) => logger.error(message, { ...context, ...trusted }), critical: (message, context) => logger.critical(message, { ...context, ...trusted }) }
}

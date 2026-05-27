import type { H3Event } from 'h3'

import type { Logger } from '../../../logging/Logger'
import { loggerToken } from '../../../logging/LoggerToken'
import { useContainer } from '../utils/useContainer'

export function useLogger(event: H3Event): Logger {
  const container = useContainer(event)
  return container.make(loggerToken)
}

export type { Logger, LogContext, LogLevel } from '../../../logging/index'
export { loggerToken }

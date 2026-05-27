import type { Resolver } from '../core/container/Container'
import { ConsoleLogger } from './ConsoleLogger'
import type { Logger } from './Logger'
import { loggerToken } from './LoggerToken'

const fallback: Logger = new ConsoleLogger({ threshold: 'warn' })

export function loggerFor(resolver: Resolver | null | undefined): Logger {
  if (resolver !== null && resolver !== undefined && resolver.has(loggerToken)) {
    return resolver.make(loggerToken)
  }
  return fallback
}

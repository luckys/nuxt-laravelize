import type { LogContext, Logger } from '../../../logging/Logger'
import type { LogLevel } from '../../../logging/LogLevel'

export interface LogRecord {
  readonly level: LogLevel
  readonly message: string
  readonly context: LogContext | undefined
}

export class FakeLogger implements Logger {
  readonly records: LogRecord[] = []

  debug(message: string, context?: LogContext): void { this.records.push({ level: 'debug', message, context }) }
  info(message: string, context?: LogContext): void { this.records.push({ level: 'info', message, context }) }
  warn(message: string, context?: LogContext): void { this.records.push({ level: 'warn', message, context }) }
  error(message: string, context?: LogContext): void { this.records.push({ level: 'error', message, context }) }
  critical(message: string, context?: LogContext): void { this.records.push({ level: 'critical', message, context }) }

  reset(): void { this.records.length = 0 }

  hasMessage(level: LogLevel, message: string): boolean {
    return this.records.some((r) => r.level === level && r.message === message)
  }
}

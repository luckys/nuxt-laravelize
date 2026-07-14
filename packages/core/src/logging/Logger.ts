import { shouldEmit, type LogLevel } from './LogLevel'

export type LogContext = Readonly<Record<string, unknown>>

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  critical(message: string, context?: LogContext): void
}

export abstract class AbstractLogger implements Logger {
  protected readonly threshold: LogLevel

  constructor(threshold: LogLevel = 'debug') {
    this.threshold = threshold
  }

  debug(message: string, context?: LogContext): void { this.#emit('debug', message, context) }
  info(message: string, context?: LogContext): void { this.#emit('info', message, context) }
  warn(message: string, context?: LogContext): void { this.#emit('warn', message, context) }
  error(message: string, context?: LogContext): void { this.#emit('error', message, context) }
  critical(message: string, context?: LogContext): void { this.#emit('critical', message, context) }

  protected abstract write(level: LogLevel, message: string, context: LogContext | undefined): void

  #emit(level: LogLevel, message: string, context: LogContext | undefined): void {
    if (!shouldEmit(level, this.threshold)) return
    this.write(level, message, context)
  }
}

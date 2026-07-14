import { AbstractLogger, type LogContext } from './Logger'
import type { LogLevel } from './LogLevel'

export interface ConsoleLoggerOptions {
  readonly threshold?: LogLevel
  readonly stream?: Console
}

const LEVEL_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  critical: 'error',
}

export class ConsoleLogger extends AbstractLogger {
  readonly #stream: Console

  constructor(options: ConsoleLoggerOptions = {}) {
    super(options.threshold ?? 'debug')
    this.#stream = options.stream ?? console
  }

  protected override write(level: LogLevel, message: string, context: LogContext | undefined): void {
    const prefix = `[${level.toUpperCase()}]`
    if (context === undefined) this.#stream[LEVEL_METHOD[level]](prefix, message)
    else this.#stream[LEVEL_METHOD[level]](prefix, message, context)
  }
}

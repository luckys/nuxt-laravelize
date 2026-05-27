import { AbstractLogger, type LogContext } from './Logger'
import type { LogLevel } from './LogLevel'

export interface StructuredLoggerOptions {
  readonly threshold?: LogLevel
  readonly sink?: (line: string) => void
  readonly now?: () => Date
  readonly serviceName?: string
}

export class StructuredLogger extends AbstractLogger {
  readonly #sink: (line: string) => void
  readonly #now: () => Date
  readonly #serviceName: string | undefined

  constructor(options: StructuredLoggerOptions = {}) {
    super(options.threshold ?? 'info')
    this.#sink = options.sink ?? ((line) => process.stdout.write(`${line}\n`))
    this.#now = options.now ?? (() => new Date())
    this.#serviceName = options.serviceName
  }

  protected override write(level: LogLevel, message: string, context: LogContext | undefined): void {
    const payload: Record<string, unknown> = {
      timestamp: this.#now().toISOString(),
      level,
      message,
    }
    if (this.#serviceName !== undefined) payload.service = this.#serviceName
    if (context !== undefined) payload.context = context
    this.#sink(JSON.stringify(payload))
  }
}

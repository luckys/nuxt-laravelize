import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, extname } from 'node:path'

import { AbstractLogger, type LogContext } from './Logger'
import type { LogLevel } from './LogLevel'

export interface FileLoggerOptions {
  readonly path: string
  readonly threshold?: LogLevel
  readonly maxBytes?: number
  readonly now?: () => Date
}

export class FileLogger extends AbstractLogger {
  readonly #path: string
  readonly #maxBytes: number
  readonly #now: () => Date

  constructor(options: FileLoggerOptions) {
    super(options.threshold ?? 'info')
    this.#path = options.path
    this.#maxBytes = options.maxBytes ?? 10 * 1024 * 1024
    this.#now = options.now ?? (() => new Date())
  }

  protected override write(level: LogLevel, message: string, context: LogContext | undefined): void {
    mkdirSync(dirname(this.#path), { recursive: true })
    this.#rotateIfNeeded()
    const line = JSON.stringify({
      timestamp: this.#now().toISOString(),
      level,
      message,
      ...(context === undefined ? {} : { context }),
    })
    appendFileSync(this.#path, `${line}\n`)
  }

  #rotateIfNeeded(): void {
    if (!existsSync(this.#path)) return
    const stats = statSync(this.#path)
    if (stats.size < this.#maxBytes) return
    const ext = extname(this.#path)
    const base = this.#path.slice(0, this.#path.length - ext.length)
    const rotated = `${base}.${this.#now().getTime()}${ext}`
    renameSync(this.#path, rotated)
  }
}

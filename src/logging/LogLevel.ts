export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'critical']

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
}

export function shouldEmit(level: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold]
}

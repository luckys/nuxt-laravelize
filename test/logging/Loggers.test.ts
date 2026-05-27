import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConsoleLogger } from '../../src/logging/ConsoleLogger'
import { FileLogger } from '../../src/logging/FileLogger'
import { StructuredLogger } from '../../src/logging/StructuredLogger'
import { loggerFor } from '../../src/logging/loggerFor'
import { loggerToken } from '../../src/logging/LoggerToken'
import { createContainer } from '../../src/core/container/Container'

describe('ConsoleLogger', () => {
  it('respects the threshold', () => {
    const captured: Array<[string, unknown[]]> = []
    const fakeConsole = {
      debug: (...a: unknown[]) => captured.push(['debug', a]),
      info: (...a: unknown[]) => captured.push(['info', a]),
      warn: (...a: unknown[]) => captured.push(['warn', a]),
      error: (...a: unknown[]) => captured.push(['error', a]),
      log: () => {},
    } as unknown as Console

    const logger = new ConsoleLogger({ threshold: 'warn', stream: fakeConsole })
    logger.debug('skip-me')
    logger.warn('keep')
    logger.error('keep')

    expect(captured.map(([level]) => level)).toEqual(['warn', 'error'])
  })

  it('forwards context to the underlying console', () => {
    const captured: unknown[] = []
    const fakeConsole = { info: (...a: unknown[]) => captured.push(a), debug() {}, warn() {}, error() {} } as unknown as Console
    new ConsoleLogger({ stream: fakeConsole }).info('hello', { user: 'ada' })
    expect(captured[0]).toEqual(['[INFO]', 'hello', { user: 'ada' }])
  })
})

describe('StructuredLogger', () => {
  it('writes single-line JSON to its sink', () => {
    const lines: string[] = []
    const logger = new StructuredLogger({
      sink: (line) => lines.push(line),
      now: () => new Date('2026-01-01T00:00:00Z'),
      serviceName: 'billing',
    })
    logger.info('processed', { id: 7 })

    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'info',
      message: 'processed',
      service: 'billing',
      context: { id: 7 },
    })
  })
})

describe('FileLogger', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nlz-log-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('appends one JSON line per call and creates the file', () => {
    const path = join(dir, 'a.log')
    const logger = new FileLogger({ path, now: () => new Date('2026-01-01T00:00:00Z') })
    logger.info('first')
    logger.error('second', { kind: 'oops' })
    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({ timestamp: '2026-01-01T00:00:00.000Z', level: 'info', message: 'first' })
    expect(lines[1]?.context).toEqual({ kind: 'oops' })
  })

  it('rotates when the file exceeds maxBytes', () => {
    const path = join(dir, 'rot.log')
    writeFileSync(path, 'x'.repeat(120))
    const logger = new FileLogger({ path, maxBytes: 100, now: () => new Date('2026-01-01T00:00:00Z') })
    logger.warn('after-rotation')
    expect(statSync(path).size).toBeLessThan(120)
  })
})

describe('loggerFor', () => {
  it('returns the registered logger when present', () => {
    const container = createContainer()
    const custom: Array<[string, unknown]> = []
    container.instance(loggerToken, {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (m, c) => custom.push([m, c]),
      critical: () => {},
    })
    const logger = loggerFor(container)
    logger.error('boom', { id: 1 })
    expect(custom).toEqual([['boom', { id: 1 }]])
  })

  it('falls back to a console logger when none is registered', () => {
    const container = createContainer()
    const logger = loggerFor(container)
    expect(logger).toBeDefined()
    expect(typeof logger.error).toBe('function')
  })

  it('also accepts null/undefined', () => {
    expect(loggerFor(null).error).toBeTypeOf('function')
    expect(loggerFor(undefined).error).toBeTypeOf('function')
  })
})

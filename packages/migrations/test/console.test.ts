import { describe, expect, it, vi } from 'vitest'
import { createMigrationConsole } from '../src/console.js'

const invocation = (options: Record<string, unknown> = {}, confirmation = true, interactive = true) => ({ arguments: {}, options, resolver: {} as never, signal: new AbortController().signal,
  terminal: { interactive, output: '', write(value: string) { this.output += value }, writeError() {} },
  prompt: { confirm: vi.fn(async () => confirmation), text: vi.fn(async () => '') },
})

describe('migration console integration', () => {
  it('exposes all roadmap commands and delegates status/up/pretend', async () => {
    const runner = { status: vi.fn(async () => [{ id: 'app:a', namespace: 'app', name: 'a', checksum: 'x', state: 'pending' }]), up: vi.fn(async () => ({ executed: [], statements: [{ sql: 'CREATE TABLE x' }] })) }
    const integration = createMigrationConsole(runner as never)
    expect(integration.commands.map(command => command.name)).toEqual(['migrate:status', 'migrate:up', 'migrate:rollback', 'migrate:reset', 'migrate:fresh', 'migrate:pretend'])
    const status = invocation()
    await integration.bindings[0]!.handler.handle(status)
    const pretend = invocation({ limit: 2 })
    await integration.bindings[5]!.handler.handle(pretend)
    expect(status.terminal.output).toContain('pending\tapp:a')
    expect(runner.up).toHaveBeenCalledWith({ pretend: true, limit: 2 })
  })

  it('fails closed before destructive operations without affirmative interactive confirmation', async () => {
    const runner = { rollback: vi.fn(), reset: vi.fn(), fresh: vi.fn() }
    const integration = createMigrationConsole(runner as never)
    await expect(integration.bindings[2]!.handler.handle(invocation({}, false))).rejects.toThrow('not confirmed')
    await expect(integration.bindings[3]!.handler.handle(invocation({}, true, false))).rejects.toThrow('interactive confirmation')
    expect(runner.rollback).not.toHaveBeenCalled()
    expect(runner.reset).not.toHaveBeenCalled()
    expect(runner.fresh).not.toHaveBeenCalled()
  })
})

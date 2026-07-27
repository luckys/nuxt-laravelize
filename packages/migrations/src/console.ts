import { defineCommand, option, type AnyCommand, type CommandHandler, type CommandInvocation } from '@nuxt-laravelize/console'
import type { MigrationDialect, MigrationRunResult, MigrationRunner, MigrationStatus } from './index.js'

type HandlerToken = Readonly<{ key: string }>
export interface MigrationConsoleBinding { readonly token: HandlerToken, readonly handler: CommandHandler<Record<string, never>, Record<string, unknown>> }
export interface MigrationConsoleIntegration { readonly commands: readonly AnyCommand[], readonly bindings: readonly MigrationConsoleBinding[] }

const tokens = Object.freeze({
  status: { key: 'laravelize.migrations.console.status' }, up: { key: 'laravelize.migrations.console.up' },
  rollback: { key: 'laravelize.migrations.console.rollback' }, reset: { key: 'laravelize.migrations.console.reset' },
  fresh: { key: 'laravelize.migrations.console.fresh' }, pretend: { key: 'laravelize.migrations.console.pretend' },
})
export const migrationConsoleTokens = tokens

/** Returns definitions plus DI bindings for registration in the console application container. */
export function createMigrationConsole<D extends MigrationDialect>(runner: MigrationRunner<D>): MigrationConsoleIntegration {
  const handlers = {
    status: handler(async invocation => writeStatus(invocation, await runner.status())),
    up: handler(async invocation => writeRun(invocation, await runner.up({ pretend: booleanOption(invocation, 'pretend'), ...(integerOption(invocation, 'limit') ? { limit: integerOption(invocation, 'limit') } : {}) }))),
    rollback: handler(async (invocation) => {
      await confirmDestructive(invocation, 'Rollback the latest migration batch?')
      writeRun(invocation, await runner.rollback({ pretend: booleanOption(invocation, 'pretend'), batches: integerOption(invocation, 'batches') ?? 1 }))
    }),
    reset: handler(async (invocation) => {
      await confirmDestructive(invocation, 'Rollback all applied migrations?')
      writeRun(invocation, await runner.reset({ pretend: booleanOption(invocation, 'pretend') }))
    }),
    fresh: handler(async (invocation) => {
      await confirmDestructive(invocation, 'Drop all explicitly owned objects and migrate again?')
      writeRun(invocation, await runner.fresh({ pretend: booleanOption(invocation, 'pretend') }))
    }),
    pretend: handler(async invocation => writeRun(invocation, await runner.up({ pretend: true, ...(integerOption(invocation, 'limit') ? { limit: integerOption(invocation, 'limit') } : {}) }))),
  }
  const pretend = option.boolean({ description: 'Print SQL without changing the database.' })
  const limit = option.integer({ description: 'Maximum migrations.', validate: value => value > 0 || 'must be positive' })
  const commands: AnyCommand[] = [
    defineCommand({ name: 'migrate:status', description: 'Show migration status.', handler: tokens.status }),
    defineCommand({ name: 'migrate:up', description: 'Apply pending migrations.', options: { pretend, limit }, handler: tokens.up }),
    defineCommand({ name: 'migrate:rollback', description: 'Rollback recent migration batches.', options: { pretend, batches: option.integer({ default: 1, description: 'Number of batches.', validate: value => value > 0 || 'must be positive' }) }, handler: tokens.rollback }),
    defineCommand({ name: 'migrate:reset', description: 'Rollback every migration.', options: { pretend }, handler: tokens.reset }),
    defineCommand({ name: 'migrate:fresh', description: 'Drop owned objects and migrate.', options: { pretend }, handler: tokens.fresh }),
    defineCommand({ name: 'migrate:pretend', description: 'Print pending migration SQL.', options: { limit }, handler: tokens.pretend }),
  ]
  return { commands, bindings: Object.entries(handlers).map(([name, value]) => ({ token: tokens[name as keyof typeof tokens], handler: value })) }
}

type Invocation = CommandInvocation<Record<string, never>, Record<string, unknown>>
const handler = (handle: (invocation: Invocation) => Promise<void>): CommandHandler<Record<string, never>, Record<string, unknown>> => ({
  handle: async (invocation) => {
    await handle(invocation)
    return undefined
  },
})
const booleanOption = (invocation: Invocation, name: string): boolean => invocation.options[name] === true
const integerOption = (invocation: Invocation, name: string): number | undefined => typeof invocation.options[name] === 'number' ? invocation.options[name] as number : undefined
async function confirmDestructive(invocation: Invocation, question: string): Promise<void> {
  if (!invocation.terminal.interactive) throw new Error('Destructive migration commands require interactive confirmation')
  if (!await invocation.prompt.confirm(question, { default: false })) throw new Error('Destructive migration command was not confirmed')
}
function writeStatus(invocation: Invocation, statuses: readonly MigrationStatus[]): void {
  for (const status of statuses) invocation.terminal.write(`${status.state}\t${status.id}${status.batch ? `\tbatch ${status.batch}` : ''}\n`)
}
function writeRun(invocation: Invocation, result: MigrationRunResult): void {
  for (const statement of result.statements) invocation.terminal.write(`${statement.sql}\n`)
  invocation.terminal.write(`${result.executed.length} migration(s) ${result.executed[0]?.direction === 'down' ? 'rolled back' : 'processed'}.\n`)
}

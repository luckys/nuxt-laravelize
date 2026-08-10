import type { Resolver, Token } from '@luckys_luis/nuxt-laravelize-core/runtime'
import type { ProcessAdapter, Prompt, Terminal } from './ports'
import type { InferSchema, Schema } from './schema'
import { validateValue } from './schema'

export interface CommandInvocation<Arguments, Options> {
  readonly arguments: Arguments
  readonly options: Options
  readonly resolver: Resolver
  readonly terminal: Terminal
  readonly prompt: Prompt
  readonly signal: AbortSignal
}

export interface CommandHandler<Arguments, Options> {
  handle(invocation: CommandInvocation<Arguments, Options>): undefined | number | Promise<void> | Promise<number>
}

export interface CommandDefinition<ArgumentsSchema extends Schema = Schema, OptionsSchema extends Schema = Schema> {
  readonly name: string
  readonly aliases?: readonly string[]
  readonly description?: string
  readonly arguments?: ArgumentsSchema
  readonly options?: OptionsSchema
  readonly handler: Token<CommandHandler<InferSchema<ArgumentsSchema>, InferSchema<OptionsSchema>>>
}

export function defineCommand<const ArgumentsSchema extends Schema = Record<never, never>, const OptionsSchema extends Schema = Record<never, never>>(definition: CommandDefinition<ArgumentsSchema, OptionsSchema>): CommandDefinition<ArgumentsSchema, OptionsSchema> {
  return Object.freeze({ ...definition, aliases: Object.freeze([...(definition.aliases ?? [])]), arguments: Object.freeze({ ...(definition.arguments ?? {}) }) as ArgumentsSchema, options: Object.freeze({ ...(definition.options ?? {}) }) as OptionsSchema })
}

const COMMAND_NAME = /^[a-z][a-z0-9]*(?::[a-z][a-z0-9-]*)*$/
const RESERVED_COMMAND_NAMES = new Set(['help', 'list'])

export class DuplicateCommandError extends Error {
  constructor(name: string) {
    super(`Command or alias "${name}" is already registered`)
    this.name = 'DuplicateCommandError'
  }
}

export class CommandRegistry {
  readonly #commands = new Map<string, CommandDefinition>()
  readonly #lookup = new Map<string, CommandDefinition>()

  register<const A extends Schema, const O extends Schema>(command: CommandDefinition<A, O>): this {
    const names = [command.name, ...(command.aliases ?? [])]
    for (const name of names) {
      if (!COMMAND_NAME.test(name)) throw new TypeError(`Invalid command name "${name}"`)
      if (RESERVED_COMMAND_NAMES.has(name)) throw new TypeError(`Command name or alias "${name}" is reserved`)
      if (this.#lookup.has(name) || names.indexOf(name) !== names.lastIndexOf(name)) throw new DuplicateCommandError(name)
    }
    this.#validateSchema(command)
    this.#commands.set(command.name, command as CommandDefinition)
    for (const name of names) this.#lookup.set(name, command as CommandDefinition)
    return this
  }

  get(name: string): CommandDefinition | undefined { return this.#lookup.get(name) }
  all(): readonly CommandDefinition[] { return [...this.#commands.values()].sort((left, right) => left.name.localeCompare(right.name)) }

  #validateSchema(command: CommandDefinition): void {
    let optionalSeen = false
    for (const [name, definition] of Object.entries(command.arguments ?? {})) {
      this.#validateFieldName(name)
      this.#validateDefault(name, definition)
      if (!definition.required) optionalSeen = true
      else if (optionalSeen) throw new TypeError('Required arguments cannot follow optional arguments')
    }
    const shorts = new Set<string>()
    for (const [name, definition] of Object.entries(command.options ?? {})) {
      this.#validateFieldName(name)
      this.#validateDefault(name, definition)
      if (name === 'help') throw new TypeError('Option "--help" is reserved')
      if (definition.short === 'h') throw new TypeError('Option "-h" is reserved')
      if (definition.short !== undefined && (!/^[a-z0-9]$/i.test(definition.short) || shorts.has(definition.short))) throw new TypeError(`Invalid or duplicate short option "${definition.short}"`)
      if (definition.short) shorts.add(definition.short)
    }
  }

  #validateFieldName(name: string): void {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new TypeError(`Invalid command field "${name}"`)
  }

  #validateDefault(name: string, definition: Schema[string]): void {
    if (definition.defaultValue !== undefined) validateValue(name, definition, definition.defaultValue)
  }
}

export type AnyCommand = CommandDefinition<Schema, Schema>
export type ConsoleProcess = ProcessAdapter

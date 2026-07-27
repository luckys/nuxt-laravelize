import type { CommandDefinition } from './command'
import type { InferSchema, Schema, ValueDefinition } from './schema'
import { validateValue } from './schema'

export class ConsoleInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConsoleInputError'
  }
}

export interface ParsedCommandInput<A extends Schema, O extends Schema> { readonly arguments: InferSchema<A>, readonly options: InferSchema<O> }

export function parseCommandInput<const A extends Schema, const O extends Schema>(command: CommandDefinition<A, O>, tokens: readonly string[]): ParsedCommandInput<A, O> {
  const argumentsSchema = (command.arguments ?? {}) as A
  const optionsSchema = (command.options ?? {}) as O
  const positional: string[] = []
  const rawOptions = new Map<string, string>()
  const shorts = new Map(Object.entries(optionsSchema).flatMap(([name, definition]) => definition.short ? [[definition.short, name] as const] : []))
  let optionsEnded = false

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (!optionsEnded && token === '--') {
      optionsEnded = true
      continue
    }
    if (!optionsEnded && token.startsWith('--')) {
      const consumed = consumeLongOption(token, tokens[index + 1], optionsSchema, rawOptions)
      index += consumed
      continue
    }
    if (!optionsEnded && /^-[^-]/.test(token)) {
      const consumed = consumeShortOption(token, tokens[index + 1], optionsSchema, shorts, rawOptions)
      index += consumed
      continue
    }
    positional.push(token)
  }

  const parsedArguments: Record<string, unknown> = {}
  const entries = Object.entries(argumentsSchema)
  if (positional.length > entries.length) throw new ConsoleInputError(`Unexpected argument "${positional[entries.length]}"`)
  entries.forEach(([name, definition], index) => {
    parsedArguments[name] = parseField(name, definition, positional[index])
  })

  const parsedOptions: Record<string, unknown> = {}
  for (const [name, definition] of Object.entries(optionsSchema)) parsedOptions[name] = parseField(`--${name}`, definition, rawOptions.get(name))
  return { arguments: parsedArguments as InferSchema<A>, options: parsedOptions as InferSchema<O> }
}

function consumeLongOption(token: string, next: string | undefined, schema: Schema, values: Map<string, string>): number {
  const separator = token.indexOf('=')
  const rawName = token.slice(2, separator === -1 ? undefined : separator)
  let name = rawName
  let definition = schema[name]
  let negated = false
  if (!definition && rawName.startsWith('no-')) {
    name = rawName.slice(3)
    definition = schema[name]
    negated = true
  }
  if (!definition) throw new ConsoleInputError(`Unknown option "--${rawName}"`)
  if (values.has(name)) throw new ConsoleInputError(`Option "--${name}" cannot be provided more than once`)
  if (definition.kind === 'boolean') {
    if (separator !== -1) throw new ConsoleInputError(`Option "--${rawName}" does not accept a value`)
    values.set(name, String(!negated))
    return 0
  }
  if (negated) throw new ConsoleInputError(`Option "--${rawName}" cannot be negated`)
  const inline = separator === -1 ? undefined : token.slice(separator + 1)
  const value = inline ?? next
  if (value === undefined || (inline === undefined && value.startsWith('-'))) throw new ConsoleInputError(`Option "--${name}" requires a value`)
  values.set(name, value)
  return inline === undefined ? 1 : 0
}

function consumeShortOption(token: string, next: string | undefined, schema: Schema, shorts: ReadonlyMap<string, string>, values: Map<string, string>): number {
  const short = token.slice(1)
  const name = shorts.get(short)
  if (!name) throw new ConsoleInputError(`Unknown option "-${short}"`)
  const definition = schema[name]!
  if (values.has(name)) throw new ConsoleInputError(`Option "--${name}" cannot be provided more than once`)
  if (definition.kind === 'boolean') {
    values.set(name, 'true')
    return 0
  }
  if (next === undefined || next.startsWith('-')) throw new ConsoleInputError(`Option "-${short}" requires a value`)
  values.set(name, next)
  return 1
}

function parseField(name: string, definition: ValueDefinition<unknown>, raw: string | undefined): unknown {
  if (raw === undefined) {
    if (definition.defaultValue !== undefined) return definition.defaultValue
    if (definition.required) throw new ConsoleInputError(`Missing required argument "${name}"`)
    return undefined
  }
  try {
    return validateValue(name, definition, definition.parse(raw))
  }
  catch (error) {
    throw new ConsoleInputError(error instanceof Error ? error.message : `${name} is invalid`)
  }
}

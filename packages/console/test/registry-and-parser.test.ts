import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { argument, CommandRegistry, ConsoleInputError, defineCommand, option, parseCommandInput, type CommandHandler } from '../src/index'

type Empty = Record<never, never>

const handler = createToken<CommandHandler<{ name: string, count: number | undefined }, { force: boolean, tag: string | undefined }>>('test.command')
const command = defineCommand({
  name: 'demo:greet',
  description: 'Greets somebody.',
  arguments: {
    name: argument.string({ description: 'Name to greet' }),
    count: argument.integer({ required: false }),
  },
  options: {
    force: option.boolean({ short: 'f', description: 'Force greeting' }),
    tag: option.string({ short: 't' }),
  },
  handler,
})

describe('CommandRegistry', () => {
  it('registers and finds typed commands while protecting names and aliases', () => {
    const registry = new CommandRegistry().register(command)
    expect(registry.get('demo:greet')).toBe(command)
    expect(() => registry.register(command)).toThrow(/already registered/i)
  })

  it('rejects command names and aliases reserved by the console runtime', () => {
    const commandHandler = createToken<CommandHandler<Empty, Empty>>('reserved.handler')
    expect(() => new CommandRegistry().register(defineCommand({ name: 'list', handler: commandHandler }))).toThrow(/reserved/i)
    expect(() => new CommandRegistry().register(defineCommand({ name: 'valid', aliases: ['help'], handler: commandHandler }))).toThrow(/reserved/i)
  })

  it('rejects option names and short aliases reserved for help', () => {
    expect(() => new CommandRegistry().register(defineCommand({
      name: 'help:long',
      options: { help: option.boolean() },
      handler: createToken<CommandHandler<Empty, { help: boolean }>>('long-help.handler'),
    }))).toThrow(/reserved/i)
    expect(() => new CommandRegistry().register(defineCommand({
      name: 'help:short',
      options: { human: option.boolean({ short: 'h' }) },
      handler: createToken<CommandHandler<Empty, { human: boolean }>>('short-help.handler'),
    }))).toThrow(/reserved/i)
  })

  it('rejects required positional arguments after optional or defaulted arguments', () => {
    const commandHandler = createToken<CommandHandler<{ optional: string | undefined, required: string }, Empty>>('argument-order.handler')
    expect(() => new CommandRegistry().register(defineCommand({
      name: 'argument:optional-order',
      arguments: { optional: argument.string({ required: false }), required: argument.string() },
      handler: commandHandler,
    }))).toThrow(/required arguments cannot follow/i)
    expect(() => new CommandRegistry().register(defineCommand({
      name: 'argument:default-order',
      arguments: { optional: argument.string({ default: 'safe' }), required: argument.string() },
      handler: createToken<CommandHandler<{ optional: string, required: string }, Empty>>('default-order.handler'),
    }))).toThrow(/required arguments cannot follow/i)
  })

  it('validates argument and option defaults during registration', () => {
    expect(() => new CommandRegistry().register(defineCommand({
      name: 'invalid:defaults',
      arguments: { mode: argument.string({ default: 'unsafe', validate: value => value === 'safe' || 'must be safe' }) },
      options: { retries: option.integer({ default: -1, validate: value => value >= 0 || 'must not be negative' }) },
      handler: createToken<CommandHandler<{ mode: string }, { retries: number }>>('invalid-defaults.handler'),
    }))).toThrow(/mode must be safe/i)
    expect(() => new CommandRegistry().register(defineCommand({
      name: 'invalid:option-default',
      options: { retries: option.integer({ default: -1, validate: value => value >= 0 || 'must not be negative' }) },
      handler: createToken<CommandHandler<Empty, { retries: number }>>('invalid-option-default.handler'),
    }))).toThrow(/retries must not be negative/i)
  })
})

describe('parseCommandInput', () => {
  it('parses typed positional arguments, long options, and short options', () => {
    const input = parseCommandInput(command, ['Ada', '3', '--force', '--tag=math'])
    expect(input).toEqual({ arguments: { name: 'Ada', count: 3 }, options: { force: true, tag: 'math' } })
    expect(parseCommandInput(command, ['Ada', '-f', '-t', 'math']).options).toEqual({ force: true, tag: 'math' })
    expectTypeOf(input.arguments.count).toEqualTypeOf<number | undefined>()
  })

  it('rejects missing, unknown, duplicate, extra, and invalid input', () => {
    expect(() => parseCommandInput(command, [])).toThrow(ConsoleInputError)
    expect(() => parseCommandInput(command, ['Ada', '--wat'])).toThrow(/unknown option/i)
    expect(() => parseCommandInput(command, ['Ada', '--force', '--force'])).toThrow(/more than once/i)
    expect(() => parseCommandInput(command, ['Ada', '2', 'extra'])).toThrow(/unexpected argument/i)
    expect(() => parseCommandInput(command, ['Ada', 'nope'])).toThrow(/integer/i)
  })

  it.each(['constructor', 'prototype', 'toString', 'hasOwnProperty', '__proto__'])('rejects inherited option name %s', (name) => {
    expect(() => parseCommandInput(command, ['Ada', `--${name}=unsafe`])).toThrow(/unknown option/i)
    expect(() => parseCommandInput(command, ['Ada', `--no-${name}`])).toThrow(/unknown option/i)
  })

  it('supports defaults, custom validation, negated booleans, and the option terminator', () => {
    const validated = defineCommand({
      name: 'validated',
      arguments: { value: argument.string({ validate: value => value.startsWith('-') || 'must start with -' }) },
      options: { color: option.boolean({ default: true }) },
      handler: createToken<CommandHandler<{ value: string }, { color: boolean }>>('validated.handler'),
    })
    expect(parseCommandInput(validated, ['--no-color', '--', '-safe'])).toEqual({ arguments: { value: '-safe' }, options: { color: false } })
    expect(() => parseCommandInput(validated, ['unsafe'])).toThrow(/must start with/i)
  })

  it('infers options with defaults as defined values', () => {
    const configured = defineCommand({
      name: 'configured',
      options: { retries: option.integer({ default: 3 }) },
      handler: createToken<CommandHandler<Empty, { retries: number }>>('configured.handler'),
    })
    const input = parseCommandInput(configured, [])
    expect(input.options.retries).toBe(3)
    expectTypeOf(input.options.retries).toEqualTypeOf<number>()
  })

  it('matches exact --no-* option names before applying boolean negation', () => {
    const exact = defineCommand({
      name: 'exact',
      options: { 'no-color': option.boolean({ default: false }) },
      handler: createToken<CommandHandler<Empty, { 'no-color': boolean }>>('exact.handler'),
    })
    expect(parseCommandInput(exact, ['--no-color']).options['no-color']).toBe(true)
    expect(parseCommandInput(exact, ['--no-no-color']).options['no-color']).toBe(false)
  })

  it('does not consume following option tokens as missing values', () => {
    expect(() => parseCommandInput(command, ['Ada', '--tag', '--force'])).toThrow(/--tag.*requires a value/i)
    expect(() => parseCommandInput(command, ['Ada', '-t', '-f'])).toThrow(/-t.*requires a value/i)
  })

  it('accepts intentional dash-prefixed option values only with inline syntax', () => {
    expect(parseCommandInput(command, ['Ada', '--tag=-draft']).options.tag).toBe('-draft')
    expect(() => parseCommandInput(command, ['Ada', '--tag', '-draft'])).toThrow(/requires a value/i)
  })
})

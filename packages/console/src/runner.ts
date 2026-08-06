import { loggerToken, type LaravelizeApplication, type Logger } from '@nuxt-laravelize/core/runtime'
import { ExecutionContext, executionContextToken } from '@nuxt-laravelize/execution-context/runtime'
import { observabilityToken, observe, safeErrorType, type Observability } from '@nuxt-laravelize/observability/runtime'
import type { CommandDefinition, CommandHandler, CommandRegistry } from './command'
import { renderCommandHelp, renderCommandList } from './help'
import { ConsoleInputError, parseCommandInput } from './parser'
import { abortSignalToken, FailClosedPrompt, NonInteractivePromptError, processToken, promptToken, terminalToken, type ProcessAdapter, type Prompt, type Terminal } from './ports'

export const EXIT_SUCCESS = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2
export const EXIT_ABORTED = 130

export function normalizeExitCode(value: unknown): number {
  return value === undefined ? EXIT_SUCCESS : typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255 ? value : EXIT_FAILURE
}

export interface ConsoleRunnerOptions {
  readonly application: LaravelizeApplication
  readonly registry: CommandRegistry
  readonly terminal: Terminal
  readonly process: ProcessAdapter
  readonly prompt?: Prompt
}

export class ConsoleRunner {
  readonly #application: LaravelizeApplication
  readonly #registry: CommandRegistry
  readonly #terminal: Terminal
  readonly #process: ProcessAdapter
  readonly #prompt: Prompt

  constructor(options: ConsoleRunnerOptions) {
    this.#application = options.application
    this.#registry = options.registry
    this.#terminal = options.terminal
    this.#process = options.process
    this.#prompt = options.prompt ?? new FailClosedPrompt()
  }

  async run(argv: readonly string[] = this.#process.argv): Promise<number> {
    const [name, ...tokens] = argv
    if (name === undefined || name === 'list' || name === '--help' || name === '-h') {
      this.#terminal.write(renderCommandList(this.#registry))
      return EXIT_SUCCESS
    }
    if (name === 'help') return this.#showHelp(tokens[0])
    const command = this.#registry.get(name)
    if (!command) return this.#usageError(`Command "${name}" is not defined.`)
    if (tokens.length === 1 && (tokens[0] === '--help' || tokens[0] === '-h')) {
      this.#terminal.write(renderCommandHelp(command))
      return EXIT_SUCCESS
    }
    return this.#execute(command, tokens)
  }

  #showHelp(name: string | undefined): number {
    if (!name) {
      this.#terminal.write(renderCommandList(this.#registry))
      return EXIT_SUCCESS
    }
    const command = this.#registry.get(name)
    if (!command) return this.#usageError(`Command "${name}" is not defined.`)
    this.#terminal.write(renderCommandHelp(command))
    return EXIT_SUCCESS
  }

  async #execute(command: CommandDefinition, tokens: readonly string[]): Promise<number> {
    let input
    try {
      input = parseCommandInput(command, tokens)
    }
    catch (error) {
      return error instanceof ConsoleInputError ? this.#usageError(error.message, command) : EXIT_FAILURE
    }

    if (this.#process.signal.aborted) return EXIT_ABORTED
    let scope
    try {
      scope = await this.#application.createScope()
    }
    catch {
      safely(() => this.#terminal.writeError('Command failed.\n'))
      return EXIT_FAILURE
    }
    let logger: Logger | undefined
    let exitCode: number | undefined
    let primaryFailure = false
    try {
      if (this.#process.signal.aborted) throw new Error('Command aborted during scope creation.')
      scope.override(terminalToken, this.#terminal)
      scope.override(promptToken, this.#prompt)
      scope.override(processToken, this.#process)
      scope.override(abortSignalToken, this.#process.signal)
      const observability = scope.has(observabilityToken) ? scope.make(observabilityToken) : undefined
      logger = scope.has(loggerToken) ? scope.make(loggerToken) : undefined
      const operation = async (): Promise<number> => {
        const active = observability?.activeSpan()
        const executionContext = ExecutionContext.create({ source: { type: 'cli', name: command.name }, ...(active?.traceId && active.spanId ? { traceId: active.traceId, spanId: active.spanId } : {}) })
        scope.override(executionContextToken, executionContext)
        logger?.info('Console command started', { command: command.name, executionId: executionContext.snapshot().executionId })
        const handler = scope.make(command.handler) as CommandHandler<Record<string, unknown>, Record<string, unknown>>
        const result = await handler.handle({ ...input, resolver: scope, terminal: this.#terminal, prompt: this.#prompt, signal: this.#process.signal })
        const code = this.#process.signal.aborted ? EXIT_ABORTED : normalizeExitCode(result)
        logger?.info('Console command finished', { command: command.name, exitCode: code })
        return code
      }
      exitCode = observability ? await this.#observed(observability, command.name, operation) : await operation()
    }
    catch (error) {
      primaryFailure = true
      if (this.#process.signal.aborted || isAbortError(error)) exitCode = EXIT_ABORTED
      else {
        safely(() => logger?.error('Console command failed', { command: command.name, errorType: safeErrorType(error) }))
        safely(() => this.#terminal.writeError(error instanceof NonInteractivePromptError ? `${error.message}\n` : 'Command failed.\n'))
        exitCode = EXIT_FAILURE
      }
    }
    try {
      await scope.dispose()
    }
    catch (error) {
      if (!primaryFailure) {
        safely(() => logger?.error('Console command scope disposal failed', { command: command.name, errorType: safeErrorType(error) }))
        safely(() => this.#terminal.writeError('Command failed.\n'))
        exitCode = EXIT_FAILURE
      }
    }
    return exitCode ?? EXIT_FAILURE
  }

  #observed(observability: Observability, name: string, operation: () => Promise<number>): Promise<number> {
    return observe(observability, 'console.command', operation, { kind: 'internal', attributes: { 'console.command.name': name } })
  }

  #usageError(message: string, command?: CommandDefinition): number {
    this.#terminal.writeError(`${message}\n${command ? renderCommandHelp(command) : 'Run with --help to list commands.\n'}`)
    return EXIT_USAGE
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function safely(operation: () => void): void {
  try {
    operation()
  }
  catch {
    return
  }
}

import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { ConsoleRunner, type ConsoleRunnerOptions } from './runner'
import { FailClosedPrompt, NonInteractivePromptError, type ProcessAdapter, type Prompt, type Terminal } from './ports'

export class NodeTerminal implements Terminal {
  readonly #stdout: NodeJS.WritableStream
  readonly #stderr: NodeJS.WritableStream
  readonly interactive: boolean
  constructor(options: Readonly<{
    stdout?: NodeJS.WritableStream & { readonly isTTY?: boolean }
    stderr?: NodeJS.WritableStream
    stdin?: NodeJS.ReadableStream & { readonly isTTY?: boolean }
  }> = {}) {
    this.#stdout = options.stdout ?? process.stdout
    this.#stderr = options.stderr ?? process.stderr
    this.interactive = Boolean((options.stdin ?? process.stdin).isTTY && (options.stdout ?? process.stdout).isTTY)
  }

  write(value: string): void { this.#stdout.write(value) }
  writeError(value: string): void { this.#stderr.write(value) }
}

export class NodePrompt implements Prompt {
  readonly #stdin: NodeJS.ReadableStream
  readonly #stdout: NodeJS.WritableStream
  readonly #signal: AbortSignal
  constructor(private readonly terminal: Terminal, options: Readonly<{ signal: AbortSignal, stdin?: NodeJS.ReadableStream, stdout?: NodeJS.WritableStream }>) {
    this.#stdin = options.stdin ?? process.stdin
    this.#stdout = options.stdout ?? process.stdout
    this.#signal = options.signal
  }

  async text(message: string, options: Readonly<{ default?: string }> = {}): Promise<string> {
    if (!this.terminal.interactive) throw new NonInteractivePromptError()
    const readline = createInterface({ input: this.#stdin, output: this.#stdout })
    try {
      const answer = await readline.question(`${message}${options.default ? ` (${options.default})` : ''} `, { signal: this.#signal })
      return answer || options.default || ''
    }
    finally {
      readline.close()
    }
  }

  async confirm(message: string, options: Readonly<{ default?: boolean }> = {}): Promise<boolean> {
    const suffix = options.default ? 'Y/n' : 'y/N'
    const answer = (await this.text(`${message} [${suffix}]`)).trim().toLowerCase()
    if (!answer) return options.default ?? false
    if (answer === 'y' || answer === 'yes') return true
    if (answer === 'n' || answer === 'no') return false
    throw new TypeError('Expected yes or no')
  }
}

export class NodeProcessAdapter implements ProcessAdapter {
  readonly argv: readonly string[]
  readonly #controller = new AbortController()
  readonly #onInterrupt = () => this.#controller.abort(new DOMException('Interrupted', 'AbortError'))
  constructor(argv: readonly string[] = process.argv.slice(2)) {
    this.argv = [...argv]
    process.once('SIGINT', this.#onInterrupt)
    process.once('SIGTERM', this.#onInterrupt)
  }

  get signal(): AbortSignal { return this.#controller.signal }
  setExitCode(code: number): void { process.exitCode = code }
  dispose(): void {
    process.off('SIGINT', this.#onInterrupt)
    process.off('SIGTERM', this.#onInterrupt)
  }
}

export interface RunNodeConsoleOptions extends Omit<ConsoleRunnerOptions, 'terminal' | 'process' | 'prompt'> {
  readonly terminal?: Terminal
  readonly process?: NodeProcessAdapter
  readonly prompt?: Prompt
  readonly stdin?: NodeJS.ReadableStream & { readonly isTTY?: boolean }
  readonly stdout?: NodeJS.WritableStream & { readonly isTTY?: boolean }
  readonly stderr?: NodeJS.WritableStream
}

export async function runNodeConsole(options: RunNodeConsoleOptions): Promise<number> {
  const terminal = options.terminal ?? new NodeTerminal({ stdin: options.stdin, stdout: options.stdout, stderr: options.stderr })
  const processAdapter = options.process ?? new NodeProcessAdapter()
  const prompt = options.prompt ?? (options.terminal
    ? new FailClosedPrompt()
    : new NodePrompt(terminal, { signal: processAdapter.signal, stdin: options.stdin, stdout: options.stdout }))
  try {
    const code = await new ConsoleRunner({ ...options, terminal, process: processAdapter, prompt }).run()
    processAdapter.setExitCode(code)
    return code
  }
  finally { processAdapter.dispose() }
}

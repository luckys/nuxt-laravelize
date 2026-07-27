import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { ConsoleRunner, type ConsoleRunnerOptions } from './runner'
import { NonInteractivePromptError, type ProcessAdapter, type Prompt, type Terminal } from './ports'

export class NodeTerminal implements Terminal {
  readonly #stdout: NodeJS.WriteStream
  readonly #stderr: NodeJS.WriteStream
  readonly interactive: boolean
  constructor(options: Readonly<{ stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream, stdin?: NodeJS.ReadStream }> = {}) {
    this.#stdout = options.stdout ?? process.stdout
    this.#stderr = options.stderr ?? process.stderr
    this.interactive = Boolean((options.stdin ?? process.stdin).isTTY && this.#stdout.isTTY)
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
  }

  get signal(): AbortSignal { return this.#controller.signal }
  setExitCode(code: number): void { process.exitCode = code }
  dispose(): void { process.off('SIGINT', this.#onInterrupt) }
}

export async function runNodeConsole(options: Omit<ConsoleRunnerOptions, 'terminal' | 'process' | 'prompt'> & Readonly<{ terminal?: Terminal, process?: NodeProcessAdapter, prompt?: Prompt }>): Promise<number> {
  const terminal = options.terminal ?? new NodeTerminal()
  const processAdapter = options.process ?? new NodeProcessAdapter()
  const prompt = options.prompt ?? new NodePrompt(terminal, { signal: processAdapter.signal })
  try {
    const code = await new ConsoleRunner({ ...options, terminal, process: processAdapter, prompt }).run()
    processAdapter.setExitCode(code)
    return code
  }
  finally { processAdapter.dispose() }
}

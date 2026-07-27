import type { ProcessAdapter, Prompt, Terminal } from './ports'

export class FakeTerminal implements Terminal {
  readonly interactive: boolean
  output = ''
  errors = ''
  constructor(options: Readonly<{ interactive?: boolean }> = {}) { this.interactive = options.interactive ?? true }
  write(value: string): void { this.output += value }
  writeError(value: string): void { this.errors += value }
}

export class FakePrompt implements Prompt {
  readonly #answers: unknown[]
  readonly questions: string[] = []
  constructor(answers: readonly unknown[] = []) { this.#answers = [...answers] }
  async text(message: string, options: Readonly<{ default?: string }> = {}): Promise<string> {
    this.questions.push(message)
    return String(this.#answers.shift() ?? options.default ?? '')
  }

  async confirm(message: string, options: Readonly<{ default?: boolean }> = {}): Promise<boolean> {
    this.questions.push(message)
    return Boolean(this.#answers.shift() ?? options.default ?? false)
  }
}

export class FakeProcess implements ProcessAdapter {
  readonly argv: readonly string[]
  readonly #controller = new AbortController()
  exitCode: number | undefined
  constructor(argv: readonly string[] = []) { this.argv = [...argv] }
  get signal(): AbortSignal { return this.#controller.signal }
  setExitCode(code: number): void { this.exitCode = code }
  abort(reason?: unknown): void { this.#controller.abort(reason) }
}

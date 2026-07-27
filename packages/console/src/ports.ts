import { createToken } from '@nuxt-laravelize/core/runtime'

export interface Terminal {
  readonly interactive: boolean
  write(value: string): void
  writeError(value: string): void
}

export interface Prompt {
  text(message: string, options?: Readonly<{ default?: string }>): Promise<string>
  confirm(message: string, options?: Readonly<{ default?: boolean }>): Promise<boolean>
}

export interface ProcessAdapter {
  readonly argv: readonly string[]
  readonly signal: AbortSignal
  setExitCode(code: number): void
}

export const terminalToken = createToken<Terminal>('laravelize.console.terminal')
export const promptToken = createToken<Prompt>('laravelize.console.prompt')
export const processToken = createToken<ProcessAdapter>('laravelize.console.process')
export const abortSignalToken = createToken<AbortSignal>('laravelize.console.abort-signal')

export class NonInteractivePromptError extends Error {
  constructor() {
    super('Prompts are unavailable in non-interactive execution')
    this.name = 'NonInteractivePromptError'
  }
}

export class FailClosedPrompt implements Prompt {
  text(_message: string, _options?: Readonly<{ default?: string }>): Promise<string> { return Promise.reject(new NonInteractivePromptError()) }
  confirm(_message: string, _options?: Readonly<{ default?: boolean }>): Promise<boolean> { return Promise.reject(new NonInteractivePromptError()) }
}

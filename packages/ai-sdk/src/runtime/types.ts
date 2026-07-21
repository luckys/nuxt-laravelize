import type { LanguageModel, ModelMessage, Output, ToolSet } from 'ai'

export type AiOutput<RESULT> = ReturnType<typeof Output.object<RESULT>>

export interface AiCapabilities {
  readonly streaming: boolean
  readonly tools: boolean
  readonly structuredOutput: boolean
}

export interface AiConnection {
  readonly defaultModel: string
  readonly capabilities?: Partial<AiCapabilities>
  model(modelId: string): LanguageModel
}

export interface AiModelSelection {
  readonly connection?: string
  readonly model?: string
}

export interface AiPrompt<RESULT = string> extends AiModelSelection {
  readonly instructions?: string
  readonly messages?: readonly ModelMessage[]
  readonly prompt?: string
  readonly tools?: ToolSet
  readonly output?: AiOutput<RESULT>
  readonly providerOptions?: Record<string, Record<string, unknown>>
  readonly temperature?: number
  readonly maxOutputTokens?: number
  readonly maxRetries?: number
  readonly timeout?: number | { totalMs?: number, chunkMs?: number }
  readonly abortSignal?: AbortSignal
}

export interface AiResult<RESULT = string> {
  readonly text: string
  readonly output: RESULT
  readonly finishReason: string
  readonly usage: unknown
  readonly raw: unknown
}

export interface AiStream<RESULT = string> {
  readonly textStream: ReadableStream<string>
  readonly fullStream: AsyncIterable<unknown>
  readonly text: PromiseLike<string>
  readonly output: PromiseLike<RESULT>
  readonly raw: unknown
  toTextStreamResponse(init?: ResponseInit): Response
}

export interface AiClient {
  generate<RESULT = string>(prompt: AiPrompt<RESULT>): Promise<AiResult<RESULT>>
  stream<RESULT = string>(prompt: AiPrompt<RESULT>): AiStream<RESULT>
}

export interface AgentDefinition<INPUT, RESULT = string> {
  readonly name: string
  readonly instructions: string | ((input: INPUT) => string)
  readonly connection?: string
  readonly model?: string
  readonly tools?: ToolSet | ((input: INPUT) => ToolSet)
  readonly output?: AiOutput<RESULT>
  prompt(input: INPUT): string | readonly ModelMessage[]
}

export interface DefinedAgent<INPUT, RESULT = string> extends AgentDefinition<INPUT, RESULT> {
  generate(client: AiClient, input: INPUT): Promise<AiResult<RESULT>>
  stream(client: AiClient, input: INPUT): AiStream<RESULT>
}

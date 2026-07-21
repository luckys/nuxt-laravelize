import { generateText, streamText } from 'ai'

import { AiCapabilityNotSupportedError } from './errors'
import type { AiConnectionRegistry } from './AiConnectionRegistry'
import type { AiClient, AiPrompt, AiResult, AiStream } from './types'

export class AiSdkClient implements AiClient {
  constructor(
    private readonly connections: AiConnectionRegistry,
    private readonly defaultConnection: string,
  ) {}

  async generate<RESULT = string>(prompt: AiPrompt<RESULT>): Promise<AiResult<RESULT>> {
    const { model, options } = this.resolve(prompt, false)
    const result = await generateText({ ...options, model } as Parameters<typeof generateText>[0])
    return {
      text: result.text,
      output: result.output as RESULT,
      finishReason: result.finishReason,
      usage: result.usage,
      raw: result,
    }
  }

  stream<RESULT = string>(prompt: AiPrompt<RESULT>): AiStream<RESULT> {
    const { model, options } = this.resolve(prompt, true)
    const result = streamText({ ...options, model } as Parameters<typeof streamText>[0])
    return {
      textStream: result.textStream,
      fullStream: result.fullStream,
      text: result.text,
      output: result.output as PromiseLike<RESULT>,
      raw: result,
      toTextStreamResponse: init => result.toTextStreamResponse(init),
    }
  }

  private resolve<RESULT>(prompt: AiPrompt<RESULT>, streaming: boolean) {
    const connectionName = prompt.connection ?? this.defaultConnection
    const connection = this.connections.get(connectionName)
    const capabilities = this.connections.capabilities(connectionName)
    if (streaming && !capabilities.streaming) throw new AiCapabilityNotSupportedError(connectionName, 'streaming')
    if (prompt.tools && !capabilities.tools) throw new AiCapabilityNotSupportedError(connectionName, 'tools')
    if (prompt.output && !capabilities.structuredOutput) throw new AiCapabilityNotSupportedError(connectionName, 'structured output')
    const { connection: _connection, model: modelId, ...options } = prompt
    return {
      connectionName,
      model: connection.model(modelId ?? connection.defaultModel),
      options,
    }
  }
}

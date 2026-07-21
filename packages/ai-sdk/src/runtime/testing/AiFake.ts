import { AiFakeResponseMissingError } from '../errors'
import type { AiClient, AiPrompt, AiResult, AiStream } from '../types'

export type RecordedAiPrompt = Omit<AiPrompt<unknown>, 'output'> & { readonly output?: unknown }

export interface AiFakeResponse<RESULT = unknown> {
  readonly output: RESULT
  readonly text?: string
  readonly finishReason?: string
  readonly usage?: unknown
}

export class AiFake implements AiClient {
  readonly prompts: RecordedAiPrompt[] = []
  readonly #responses: AiFakeResponse[] = []

  constructor(responses: readonly AiFakeResponse[] = []) {
    this.#responses.push(...responses)
  }

  respond(response: AiFakeResponse): this {
    this.#responses.push(response)
    return this
  }

  async generate<RESULT = string>(prompt: AiPrompt<RESULT>): Promise<AiResult<RESULT>> {
    this.prompts.push(prompt)
    const response = this.next<RESULT>()
    return this.result(response)
  }

  stream<RESULT = string>(prompt: AiPrompt<RESULT>): AiStream<RESULT> {
    this.prompts.push(prompt)
    const response = this.next<RESULT>()
    const text = response.text ?? String(response.output)
    const textStream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(text)
        controller.close()
      },
    })
    const fullStream = (async function* () {
      yield { type: 'text-delta', text }
    })()

    return {
      textStream,
      fullStream,
      text: Promise.resolve(text),
      output: Promise.resolve(response.output),
      raw: response,
      toTextStreamResponse: init => new Response(text, init),
    }
  }

  assertPrompted(predicate: (prompt: RecordedAiPrompt) => boolean = () => true): void {
    if (!this.prompts.some(predicate)) throw new Error('Expected AI prompt was not sent.')
  }

  assertPromptCount(count: number): void {
    if (this.prompts.length !== count) throw new Error(`Expected ${count} AI prompts, received ${this.prompts.length}.`)
  }

  assertNothingPrompted(): void {
    this.assertPromptCount(0)
  }

  private next<RESULT>(): AiFakeResponse<RESULT> {
    const response = this.#responses.shift()
    if (!response) throw new AiFakeResponseMissingError()
    return response as AiFakeResponse<RESULT>
  }

  private result<RESULT>(response: AiFakeResponse<RESULT>): AiResult<RESULT> {
    return {
      text: response.text ?? String(response.output),
      output: response.output,
      finishReason: response.finishReason ?? 'stop',
      usage: response.usage ?? {},
      raw: response,
    }
  }
}

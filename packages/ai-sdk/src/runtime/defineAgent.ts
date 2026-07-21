import type { AgentDefinition, AiClient, AiPrompt, DefinedAgent } from './types'

export function defineAgent<INPUT, RESULT = string>(definition: AgentDefinition<INPUT, RESULT>): DefinedAgent<INPUT, RESULT> {
  if (!definition.name.trim()) throw new TypeError('Agent name cannot be empty.')

  const makePrompt = (input: INPUT): AiPrompt<RESULT> => {
    const content = definition.prompt(input)
    return {
      connection: definition.connection,
      model: definition.model,
      instructions: typeof definition.instructions === 'function' ? definition.instructions(input) : definition.instructions,
      tools: typeof definition.tools === 'function' ? definition.tools(input) : definition.tools,
      output: definition.output,
      ...(typeof content === 'string' ? { prompt: content } : { messages: content }),
    }
  }

  return Object.freeze({
    ...definition,
    generate: (client: AiClient, input: INPUT) => client.generate(makePrompt(input)),
    stream: (client: AiClient, input: INPUT) => client.stream(makePrompt(input)),
  })
}

import type { AgentDefinition, DefinedAgent } from './types'

export function defineAgent<INPUT, RESULT = unknown>(definition: AgentDefinition<INPUT, RESULT>): DefinedAgent<INPUT, RESULT> {
  if (!definition.name.trim()) throw new TypeError('Agent name cannot be empty.')
  const defined = { ...definition } as DefinedAgent<INPUT, RESULT>
  defined.invoke = (client, input, options) => client.invoke(defined, input, options)
  defined.dispatch = (client, input, options) => client.dispatch(defined as DefinedAgent<INPUT, unknown>, input, options)
  defined.observe = (client, options) => client.observe(defined as DefinedAgent<unknown, unknown>, options)
  return defined
}

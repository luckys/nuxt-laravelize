import { executionContextToken } from '@luckys_luis/nuxt-laravelize-execution-context/runtime'

export default defineEventHandler((event) => {
  const container = useContainer(event)
  container.override(executionContextToken, useExecutionContext(event).enrich({ actor: { type: 'system', id: 'fixture' } }))
})

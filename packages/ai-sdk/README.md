# @nuxt-laravelize/ai-sdk

Opt-in AI SDK integration for Nuxt Laravelize. It keeps provider packages in the application, exposes named connections through the Laravelize container, and delegates model execution to the provider-neutral `ai` package.

## Install

```bash
pnpm add @nuxt-laravelize/ai-sdk ai zod @ai-sdk/anthropic
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/ai-sdk'],
  laravelizeAiSdk: { defaultConnection: 'anthropic' },
})
```

AI SDK 7 requires Node.js 22 or newer. The module is intentionally not part of the Laravelize preset.

## Register a connection

```ts
// server/providers/AiConnectionsServiceProvider.ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Container, ServiceProvider } from '@nuxt-laravelize/core/runtime'
import { AiConnectionRegistry, aiConnectionsToken } from '@nuxt-laravelize/ai-sdk/runtime'

export default class AiConnectionsServiceProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(aiConnectionsToken, () => {
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      return new AiConnectionRegistry().register('anthropic', {
        defaultModel: 'claude-sonnet-4-6',
        model: model => anthropic(model),
      })
    })
  }
}
```

Only imported providers enter the server bundle. Workers AI can be registered in the same way with `workers-ai-provider`.

## Generate and stream

```ts
export default defineEventHandler(async (event) => {
  const result = await useAi(event).generate({ prompt: 'Explain bounded contexts.' })
  return { text: result.text }
})
```

```ts
export default defineEventHandler((event) => {
  return useAi(event)
    .stream({ prompt: 'Write a short release note.' })
    .toTextStreamResponse()
})
```

Use AI SDK's `Output.object`, `tool`, and provider options for structured output and tools. Connection capabilities can explicitly disable `streaming`, `tools`, or `structuredOutput`; unsupported calls fail before reaching the provider.

## Agents

```ts
import { defineAgent, Output } from '@nuxt-laravelize/ai-sdk/runtime'
import { z } from 'zod'

export const reviewer = defineAgent<{ code: string }, { score: number }>({
  name: 'reviewer',
  instructions: 'Review code concisely.',
  output: Output.object({ schema: z.object({ score: z.number().int() }) }),
  prompt: input => input.code,
})

const result = await reviewer.generate(useAi(event), { code })
result.output.score
```

## Testing

```ts
import { AiFake } from '@nuxt-laravelize/ai-sdk/testing'

const ai = new AiFake([{ output: { score: 9 } }])
const result = await reviewer.generate(ai, { code: '...' })
ai.assertPrompted(prompt => prompt.instructions === 'Review code concisely.')
```

Prompts may contain sensitive data. Laravelize does not log, audit, cache, or persist prompts and model responses automatically.

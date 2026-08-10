# `@luckys_luis/nuxt-laravelize-ai-sdk`

[Espanol](./README.es.md) | English

Provider-neutral AI SDK integration for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-ai-sdk ai zod @ai-sdk/anthropic
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-ai-sdk'],
})
```


## Package-specific usage

The package exposes a small, explicit surface. Configure its dependencies from an application provider or adapter and test its boundaries before promoting it to production.

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./runtime/server` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## AI SDK

`@luckys_luis/nuxt-laravelize-ai-sdk` is an opt-in server module built on AI SDK 7. It provides named model connections, `useAi(event)`, typed reusable agents, text streaming, tools, structured output, explicit capability checks, and `AiFake`. It is not included in the preset and requires Node.js 22 or newer.

```bash
pnpm add @luckys_luis/nuxt-laravelize-ai-sdk ai zod @ai-sdk/anthropic
```

Register providers explicitly in `server/providers`; the module never imports provider packages or reads provider credentials itself:

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import type { Container, ServiceProvider } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { AiConnectionRegistry, aiConnectionsToken } from '@luckys_luis/nuxt-laravelize-ai-sdk/runtime'

export default class AiConnectionsServiceProvider implements ServiceProvider {
  register(container: Container) {
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

Generate with `await useAi(event).generate({ prompt })`, or return `useAi(event).stream({ prompt }).toTextStreamResponse()` from a Nitro handler. `defineAgent<Input, Result>()` packages instructions, tools, output schema, model selection, and prompt construction without owning persistence or execution. Cloudflare Workers AI works through its AI SDK-compatible provider. Flue and Cloudflare Agents are agent runtimes rather than model providers and remain outside this model API.

Provider-specific options pass through unchanged. Capabilities default to enabled and can be disabled per connection. The package does not automatically log, audit, cache, or persist prompts and responses because they may contain credentials, personal data, or regulated information.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#ai-sdk). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-agent-sdk`](../agent-sdk/README.md).

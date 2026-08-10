# `@luckys_luis/nuxt-laravelize-agent-sdk`

[Espanol](./README.es.md) | English

Runtime-neutral agent API for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-agent-sdk
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-agent-sdk'],
})
```


## Package-specific usage


### Define and invoke a runtime-neutral agent

Register a named runtime once, then keep application code independent from Cloudflare Agents, Flue, or a test fake. `invoke`, `dispatch`, and `observe` are separate capabilities; check them before selecting an operation.

```ts
import { AgentRuntimeRegistry, AgentSdkClient, defineAgent } from '@luckys_luis/nuxt-laravelize-agent-sdk/runtime'

const support = defineAgent<{ question: string }, { answer: string }>({
  name: 'support',
  instanceId: 'conversation-42',
})

const client = new AgentSdkClient(runtimes, 'cloudflare')
const result = await support.invoke(client, { question: 'How do I reset my password?' })
console.log(result.result.answer)

const receipt = await support.dispatch(client, { question: 'Summarize this ticket.' })
for await (const event of support.observe(client, { receipt })) {
  console.log(event.type, event.payload)
}
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./runtime/server` | Public entrypoint for this package. |
| `./testing` | Public entrypoint for this package. |

## Agent SDK

`@luckys_luis/nuxt-laravelize-agent-sdk` is a separate opt-in common API for stateful agent runtimes. It registers named runtimes in the existing container and exposes `useAgentRuntime(event)`, typed `defineAgent()` definitions, synchronous `invoke`, asynchronous `dispatch` receipts, and async-iterable `observe` streams. Results, receipts, events, offsets, and runtime clients retain `native` escape hatches. Capabilities distinguish event streams, conversation projections, and JSON state instead of treating them as one state model.

`@luckys_luis/nuxt-laravelize-agents-cloudflare` maps operations to Cloudflare Agents 0.17.x callable RPC while preserving class and Durable Object instance identity. `@luckys_luis/nuxt-laravelize-agents-flue` maps agent operations to persistent conversations and workflow operations to durable runs using pinned `1.0.0-beta.9` packages; offsets remain opaque. All three packages are absent from the preset. Keep credentials in private runtime configuration and authorize agent identities before calls.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#agent-sdk). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-agents-cloudflare`](../agents-cloudflare/README.md), [`@luckys_luis/nuxt-laravelize-agents-flue`](../agents-flue/README.md).

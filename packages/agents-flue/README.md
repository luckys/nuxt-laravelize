# `@luckys_luis/nuxt-laravelize-agents-flue`

[Espanol](./README.es.md) | English

Flue agent and workflow adapter for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-agents-flue @luckys_luis/nuxt-laravelize-agent-sdk @flue/runtime@1.0.0-beta.9 @flue/sdk@1.0.0-beta.9
```

## Package-specific usage


### Connect Flue agents and workflows

The Flue adapter maps agent calls to persistent conversations and workflow calls to durable runs. Agent conversations require an instance ID; workflow observations can resume with an opaque offset supplied by Flue.

```ts
import { FlueAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-flue'

const runtime = new FlueAgentRuntime({
  baseUrl: process.env.FLUE_BASE_URL,
  token: process.env.FLUE_TOKEN,
})

const result = await runtime.invoke({
  name: 'support-agent',
  kind: 'agent',
  instanceId: 'conversation-42',
  input: 'Explain the invoice status.',
})
console.log(result.result)
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |

## Agent SDK

`@luckys_luis/nuxt-laravelize-agent-sdk` is a separate opt-in common API for stateful agent runtimes. It registers named runtimes in the existing container and exposes `useAgentRuntime(event)`, typed `defineAgent()` definitions, synchronous `invoke`, asynchronous `dispatch` receipts, and async-iterable `observe` streams. Results, receipts, events, offsets, and runtime clients retain `native` escape hatches. Capabilities distinguish event streams, conversation projections, and JSON state instead of treating them as one state model.

`@luckys_luis/nuxt-laravelize-agents-cloudflare` maps operations to Cloudflare Agents 0.17.x callable RPC while preserving class and Durable Object instance identity. `@luckys_luis/nuxt-laravelize-agents-flue` maps agent operations to persistent conversations and workflow operations to durable runs using pinned `1.0.0-beta.9` packages; offsets remain opaque. All three packages are absent from the preset. Keep credentials in private runtime configuration and authorize agent identities before calls.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#agent-sdk). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-agent-sdk`](../agent-sdk/README.md).

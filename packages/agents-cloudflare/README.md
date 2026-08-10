# `@luckys_luis/nuxt-laravelize-agents-cloudflare`

[Espanol](./README.es.md) | English

Cloudflare Agents adapter for Nuxt Laravelize

## Install

```bash
pnpm add @luckys_luis/nuxt-laravelize-agents-cloudflare @luckys_luis/nuxt-laravelize-agent-sdk agents
```

## Package-specific usage


### Connect Cloudflare Agents

This adapter preserves the Cloudflare Agent class and Durable Object instance identity. Every call must supply an `instanceId`; the adapter exposes invoke, dispatch, and event observation but not resumable offsets.

```ts
import { CloudflareAgentRuntime } from '@luckys_luis/nuxt-laravelize-agents-cloudflare'

const runtime = new CloudflareAgentRuntime({
  host: process.env.CLOUDFLARE_AGENT_HOST,
})

// Register this runtime in AgentRuntimeRegistry as "cloudflare".
const result = await runtime.invoke({
  name: 'support-agent',
  instanceId: 'conversation-42',
  input: { message: 'Hello' },
})
console.log(result.result)
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./native` | Public entrypoint for this package. |

## Agent SDK

`@luckys_luis/nuxt-laravelize-agent-sdk` is a separate opt-in common API for stateful agent runtimes. It registers named runtimes in the existing container and exposes `useAgentRuntime(event)`, typed `defineAgent()` definitions, synchronous `invoke`, asynchronous `dispatch` receipts, and async-iterable `observe` streams. Results, receipts, events, offsets, and runtime clients retain `native` escape hatches. Capabilities distinguish event streams, conversation projections, and JSON state instead of treating them as one state model.

`@luckys_luis/nuxt-laravelize-agents-cloudflare` maps operations to Cloudflare Agents 0.17.x callable RPC while preserving class and Durable Object instance identity. `@luckys_luis/nuxt-laravelize-agents-flue` maps agent operations to persistent conversations and workflow operations to durable runs using pinned `1.0.0-beta.9` packages; offsets remain opaque. All three packages are absent from the preset. Keep credentials in private runtime configuration and authorize agent identities before calls.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#agent-sdk). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@luckys_luis/nuxt-laravelize-agent-sdk`](../agent-sdk/README.md).

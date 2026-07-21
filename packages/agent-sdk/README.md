# @nuxt-laravelize/agent-sdk

Opt-in, runtime-neutral agent orchestration for Nuxt. Register named `AgentRuntime` implementations in the existing Laravelize container, then use `useAgentRuntime(event)` to invoke, dispatch, or observe typed definitions.

```ts
const support = defineAgent<{ message: string }, { answer: string }>({
  name: 'support',
  instanceId: input => input.message,
})

const result = await support.invoke(useAgentRuntime(event), { message: 'Hello' })
```

`invoke()` returns the mapped result plus `native`; `dispatch()` returns a provider receipt; `observe()` is an async iterable and accepts opaque offsets. `client.raw(name)` exposes the registered runtime. Capabilities explicitly distinguish event, conversation, and JSON-state observation—the common contract does not equate them. `AgentFake` provides deterministic queued results and events.

The module is not part of `@nuxt-laravelize/nuxt`.

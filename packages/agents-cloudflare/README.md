# @nuxt-laravelize/agents-cloudflare

Cloudflare Agents 0.17.x adapter for `@nuxt-laravelize/agent-sdk`. It preserves the exact Agent class name and Durable Object instance identity. Invoke, dispatch, and observe map to configurable callable RPC methods; dispatch RPCs must return `{ id, offset? }` because Cloudflare has no universal background-admission contract.

The root exposes the Node-safe `AgentClient` and `agentFetch`. The Worker-only `Agent`, `callable`, `getAgentByName`, and routing helpers are deliberately exposed from `@nuxt-laravelize/agents-cloudflare/native`, preventing `cloudflare:` imports in ordinary Node tooling. Neither entrypoint imports React or AI chat. Native clients/results remain available through `native` and the runtime's `native` property.

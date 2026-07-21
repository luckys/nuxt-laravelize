# @nuxt-laravelize/agents-flue

Adapter for `@flue/runtime` and `@flue/sdk` `1.0.0-beta.9`. Agent definitions use persistent conversation identities and map to `prompt`, `send`, and conversation observation. Definitions with `kind: 'workflow'` map to workflow invocation and durable run streams. These state models remain deliberately distinct.

Flue workflow offsets are opaque strings and are passed back to Flue unchanged. The beta.9 conversation observer resumes its own connection but does not accept an external offset, which is reported explicitly in per-kind capabilities. Native receipts, results, clients, observations, `defineAgent`, `defineWorkflow`, `dispatch`, and `invoke` remain exposed through root exports and `native` escape hatches.

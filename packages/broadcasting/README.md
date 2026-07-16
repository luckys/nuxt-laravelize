# @nuxt-laravelize/broadcasting

Server-only broadcasting. Events implementing `ShouldBroadcast` are discovered through the events package's `listenAny` hook; the events package remains unchanged.

```ts
class OrderUpdated implements ShouldBroadcast {
  constructor(readonly order: { id: string }, readonly socket?: string) {}
  broadcastOn() { return new PrivateChannel(`orders.${this.order.id}`) }
  broadcastAs() { return 'order.updated' }
  broadcastWith() { return { id: this.order.id } }
  broadcastWhen() { return true }
}
```

`broadcastWith()` is mandatory at runtime. Events without an explicit payload are ignored; broadcasting never reflects arbitrary event properties, which could expose sensitive data.

Private and presence channel objects canonicalize names to `private-*` and `presence-*`. Register authorization against that same canonical name, for example `useBroadcastChannels(event).channel('private-orders.{order}', ...)`. Unmatched and false results are denied. Return an object for presence member data. Core does not expose an authorization HTTP route or websocket client: authenticate the user in your own server endpoint, call the registry, then use your transport adapter to create its signed response.

The default driver fails closed. `driver: 'memory'` is explicit, bounded, volatile, and intended only for development/tests. Override `broadcasterToken` in an application provider for production. Payloads must be finite, acyclic JSON objects made from plain objects/arrays/primitives; `socket` is metadata and excluded from inferred payloads.

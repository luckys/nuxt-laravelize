# @nuxt-laravelize/observability-queue

Optional semantic queue bridge. `installQueueObservability()` contributes bounded W3C metadata and installs named, ordered consumer middleware. Every retry creates a separate `queue.process` span. Metric labels use only explicitly allowlisted job/queue names or `other`; IDs, payloads, baggage, and identity are never propagated or labeled. Malformed metadata fails closed without failing jobs.

Español: bridge opcional para colas con propagación W3C acotada, un span separado por reintento y cardinalidad mediante allowlists explícitas. Nunca propaga baggage, identidad, IDs ni payloads.

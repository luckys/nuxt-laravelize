# @nuxt-laravelize/execution-context-queue

Transparent execution-context propagation for `@nuxt-laravelize/queue`. Producers transport a versioned snapshot in job metadata. Workers create a fresh execution ID, retain the correlation ID, and use the producer execution ID as causation. Existing version 1 jobs remain readable.

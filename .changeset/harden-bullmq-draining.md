---
'@luckys_luis/nuxt-laravelize-queue-bullmq': patch
---

Make BullMQ worker draining idempotent, race-safe, and aware of pending terminal failure reports, with one connection-scoped reporter shared by default.

---
'@luckys_luis/nuxt-laravelize-queue': minor
'@luckys_luis/nuxt-laravelize-queue-bullmq': minor
---

Add bounded same-queue batches with eager final admission, fixed progress snapshots, cooperative cancellation context, process-local memory/testing behavior, and strictly validated retained BullMQ flow progress. BullMQ batch state uses lazy auto-removal thresholds of 24 hours/1000 completed jobs and 7 days/1000 failed jobs; pruning occurs on later terminal transitions, so hard deadlines require scheduled cleanup. Failed batch children require fresh admission rather than dead-letter retry.

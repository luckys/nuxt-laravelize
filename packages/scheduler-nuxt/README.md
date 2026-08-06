# `@nuxt-laravelize/scheduler-nuxt`

[Espanol](./README.es.md) | English

Opt-in Nuxt 4 and Nitro 2 scheduler integration

## Install

```bash
pnpm add @nuxt-laravelize/scheduler-nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/scheduler-nuxt'],
})
```


## Package-specific usage


### Compile schedules into Nuxt-owned Nitro tasks

This opt-in module targets Nuxt 4 and Nitro 2. It does not replace Nitro; it compiles explicit declarations and executes them through an application-provided runtime scope. Protect generated cron endpoints with the deployment provider secret.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/scheduler-nuxt'],
  laravelizeScheduler: {
    definitions: './server/schedules.ts',
    cronSecret: process.env.CRON_SECRET,
  },
})
```

## Public entrypoints

Use only these public entrypoints. Paths not listed here are internals and may change without notice.

| Entrypoint | Use |
|---|---|
| `package root` | Public entrypoint for this package. |
| `./runtime` | Public entrypoint for this package. |
| `./cache-lock` | Public entrypoint for this package. |
| `./adapters` | Public entrypoint for this package. |
| `./compiler` | Public entrypoint for this package. |

## Scheduler

`@nuxt-laravelize/scheduler` defines immutable framework-neutral schedules. It is not part of the Nuxt preset. `@nuxt-laravelize/scheduler-nuxt` is the opt-in Nuxt 4 adapter and compiles explicit declarations into Nuxt-owned Nitro 2 tasks; it never installs or replaces Nitro.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'

const schedule = defineSchedule((schedule) => {
  schedule.operation('reports:hourly').hourly().withoutOverlapping(30)
  schedule.dispatch('search:sync', { job: 'search:sync', queue: 'maintenance' }).everyFiveMinutes().onOneServer()
  schedule.task('reports:daily').timezone('America/New_York').dailyAt('02:30')
  schedule.task('billing:weekdays').cron('0 8 * * 1-5')
})

console.log(schedule.all())
```

Schedules support common cron helpers, IANA timezones, queue dispatch, `withoutOverlapping`, `onOneServer`, maintenance behavior, and named success/failure hooks. Timezone tasks use a minute trigger plus a DST-safe due-time guard on providers that only accept UTC cron. Nuxt-generated wrappers execute through `SchedulerRunner` and an application-provided runtime scope. `/cache-lock` adapts a capability-verified Redis/Valkey cache: `onOneServer` renews one owner-atomic occurrence claim while work runs, releases caught failures for retry, and resets the full retention TTL after success; `withoutOverlapping` uses a separate renewable owner-checked lease. Every lock-backed runner requires a stable application-and-environment `namespace`; set `occurrenceRetentionSeconds` to cover maximum execution plus the provider replay window. A process crash leaves the claim until TTL recovery. Process-local locks and providers without owner-atomic occurrence claims are rejected for `onOneServer`.

Execution is at least once around ambiguous application or cleanup failures. Use stable occurrence-based idempotency keys for operations, queue dispatch, and hooks. Lease loss aborts the exposed execution signal and rejects completion, but cooperative cancellation cannot undo external side effects; use database fencing where duplicate writes are unacceptable.

Provider trigger generation remains Nitro-owned. This integration supports Nuxt `>=4.4.5 <5`; verify that the selected Nitro preset supports scheduled tasks. Standard Nitro 2 task invocations do not propagate Cloudflare or Vercel scheduled-event timestamps, so module-generated wrappers always use an advancing wall clock. Only low-level `createGeneratedSchedulerTask(..., { timestampSource: 'event' })` calls may opt into an explicitly supplied immutable occurrence timestamp; the standalone Cloudflare adapter accepts `ScheduledController.scheduledTime`. Set a strong `CRON_SECRET` on every Vercel production deployment so Nitro authenticates generated cron endpoints. Never expose Nitro development task endpoints or wrap `runTask()` in an unauthenticated production route.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { compileSchedule, defineScheduledOperation, runScheduledTask } from '@nuxt-laravelize/scheduler/nitro3'

export default defineScheduledOperation('reports:daily', {
  execute: async payload => generateReport(String(payload.reportId ?? 'daily')),
}, 'Generate the daily report')

const nitroSchedule = defineSchedule((schedule) => {
  schedule.task('reports:daily').dailyAt('02:30')
})

const compiled = compileSchedule(nitroSchedule, {
  'reports:daily': { handler: './tasks/reports' },
})

await runScheduledTask('reports:daily', { reportId: 'report_1' })
```

Merge `compiled` into a standalone Nitro 3 configuration. Actual scheduling support depends on the selected Nitro deployment preset. This minimal adapter accepts plain operation schedules only and rejects timezone, queue dispatch, overlap/one-server, maintenance-override, and hook policies instead of silently ignoring them.

## Compatibility and boundaries

Respect the at-least-once delivery, durability, authorization, tenant isolation, and secret-handling warnings in the reference section. Examples do not replace server-side authentication, authorization, or validation.

The shared API and security reference lives in the [module guide](../../docs/modules.md#scheduler). This page summarizes this package's contract and keeps copy-pasteable examples.

## Related packages

[`@nuxt-laravelize/scheduler`](../scheduler/README.md), [`@nuxt-laravelize/cache-redis`](../cache-redis/README.md).

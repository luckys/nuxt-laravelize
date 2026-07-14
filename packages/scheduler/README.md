# @nuxt-laravelize/scheduler

Framework-neutral schedule definitions with an experimental Nitro 3 adapter.

The `./nitro3` entry point requires exactly `nitro@3.0.260610-beta`. It is not activated by the Nuxt 4 preset and must not be used to replace Nuxt's internal Nitro version.

```ts
import { defineSchedule } from '@nuxt-laravelize/scheduler'
import { compileSchedule } from '@nuxt-laravelize/scheduler/nitro3'

const schedule = defineSchedule((schedule) => {
  schedule.task('reports:daily').dailyAt('02:30')
})

export default compileSchedule(schedule, {
  'reports:daily': { handler: './tasks/reports' },
})
```

Merge the compiled result into a standalone Nitro 3 configuration. Scheduling
support depends on the selected Nitro deployment preset.

# `@luckys_luis/nuxt-laravelize-scheduler-nuxt`

[English](./README.md) | Espanol

Scheduler opt-in para Nuxt 4/Nitro 2 con politicas y triggers de provider

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-scheduler-nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-scheduler-nuxt'],
})
```


## Uso especifico del package


### Compila schedules en tasks Nitro gestionados por Nuxt

Este modulo opt-in apunta a Nuxt 4 y Nitro 2. No reemplaza Nitro; compila declaraciones explicitas y las ejecuta mediante un scope runtime aportado por la aplicacion. Protege los endpoints cron generados con el secret del proveedor de deployment.

```ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-scheduler-nuxt'],
  laravelizeScheduler: {
    definitions: './server/schedules.ts',
    cronSecret: process.env.CRON_SECRET,
  },
})
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./cache-lock` | Entrypoint publico de este package. |
| `./adapters` | Entrypoint publico de este package. |
| `./compiler` | Entrypoint publico de este package. |

## Scheduler

`@luckys_luis/nuxt-laravelize-scheduler` define schedules inmutables e independientes del framework. No forma parte del preset Nuxt. `@luckys_luis/nuxt-laravelize-scheduler-nuxt` es el adapter opt-in para Nuxt 4 y compila declaraciones explicitas como tasks del Nitro 2 gestionado por Nuxt; nunca instala ni reemplaza Nitro.

```ts
import { defineSchedule } from '@luckys_luis/nuxt-laravelize-scheduler'

const schedule = defineSchedule((schedule) => {
  schedule.operation('reports:hourly').hourly().withoutOverlapping(30)
  schedule.dispatch('search:sync', { job: 'search:sync', queue: 'maintenance' }).everyFiveMinutes().onOneServer()
  schedule.task('reports:daily').timezone('America/New_York').dailyAt('02:30')
  schedule.task('billing:weekdays').cron('0 8 * * 1-5')
})

console.log(schedule.all())
```

Los schedules soportan helpers cron, zonas IANA, dispatch a queue, `withoutOverlapping`, `onOneServer`, comportamiento en maintenance y hooks nombrados. En providers que solo aceptan cron UTC, las zonas usan un trigger por minuto y un guard DST-safe. Los wrappers Nuxt ejecutan mediante `SchedulerRunner` y un scope runtime aportado por la aplicacion. `/cache-lock` adapta un cache Redis/Valkey verificado: `onOneServer` renueva un claim validado por owner mientras ejecuta, libera fallos capturados para retry y reinicia el TTL completo despues del exito; `withoutOverlapping` usa un lease separado, renovable y validado por owner. Cada runner con locks exige un `namespace` estable por aplicacion y entorno; configura `occurrenceRetentionSeconds` para cubrir la ejecucion maxima y la ventana de replay del provider. Un crash deja el claim hasta la recuperacion por TTL. Los locks locales y los providers sin claims de ocurrencia atomicos se rechazan para `onOneServer`.

La ejecucion es at-least-once ante fallos ambiguos de aplicacion o cleanup. Usa claves de idempotencia estables por ocurrencia para operaciones, dispatch a queue y hooks. La perdida del lease aborta el signal de ejecucion expuesto y rechaza el resultado, pero la cancelacion cooperativa no deshace efectos externos; usa fencing de base de datos cuando los writes duplicados sean inaceptables.

La generacion de triggers sigue perteneciendo a Nitro. Esta integracion soporta Nuxt `>=4.4.5 <5`; verifica que el preset Nitro seleccionado soporte scheduled tasks. Las invocaciones estandar de Nitro 2 no propagan el timestamp programado de Cloudflare o Vercel, por lo que los wrappers generados por el modulo siempre usan un wall clock que avanza. Solo la API low-level `createGeneratedSchedulerTask(..., { timestampSource: 'event' })` puede optar por un timestamp de ocurrencia inmutable aportado explicitamente; el adapter Cloudflare standalone acepta `ScheduledController.scheduledTime`. Configura un `CRON_SECRET` fuerte en cada deployment de produccion en Vercel para que Nitro autentique los endpoints cron generados. Nunca expongas los endpoints de desarrollo de tasks ni envuelvas `runTask()` en una ruta de produccion sin autenticacion.

```ts
import { defineSchedule } from '@luckys_luis/nuxt-laravelize-scheduler'
import { compileSchedule, defineScheduledOperation, runScheduledTask } from '@luckys_luis/nuxt-laravelize-scheduler/nitro3'

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

Combina `compiled` con una configuracion Nitro 3 standalone. El soporte real de scheduling depende del preset de deployment seleccionado. Este adapter minimo solo acepta schedules de operaciones simples y rechaza zonas horarias, dispatch a queue, politicas de overlap/one-server, overrides de maintenance y hooks en lugar de ignorarlos silenciosamente.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#scheduler). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-scheduler`](../scheduler/README.es.md), [`@luckys_luis/nuxt-laravelize-cache-redis`](../cache-redis/README.es.md).

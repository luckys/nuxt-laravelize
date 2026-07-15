# Migracion a paquetes modulares

[English](./migration-to-modular-packages.md) | Espanol

El paquete y la facade anteriores `@luckys_luis/nuxt-laravelize` fueron eliminados. No existen reexports de compatibilidad ni comandos wrapper. Reemplaza la dependencia, la declaracion del modulo Nuxt, los imports y la propiedad de las herramientas CLI con los paquetes `@nuxt-laravelize/*` correspondientes.

## Elige una instalacion

Para el stack estandar, reemplaza el modulo anterior por el preset:

```bash
pnpm remove @luckys_luis/nuxt-laravelize
pnpm add @nuxt-laravelize/nuxt
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/nuxt'],
})
```

Para una instalacion granular, agrega y declara solo los features que uses:

```bash
pnpm remove @luckys_luis/nuxt-laravelize
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue
```

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxt-laravelize/events',
    '@nuxt-laravelize/queue',
  ],
})
```

Los modulos de features instalan y activan `@nuxt-laravelize/core` transitivamente. No declares core por separado salvo que tu aplicacion use solamente ese modulo.

## Mapeos directos

| Paquete o subpath eliminado | Reemplazo |
|---|---|
| `@luckys_luis/nuxt-laravelize` en `modules` | `@nuxt-laravelize/nuxt` o los modulos seleccionados |
| `@luckys_luis/nuxt-laravelize/core` | `@nuxt-laravelize/core/runtime` |
| `@luckys_luis/nuxt-laravelize/events` | `@nuxt-laravelize/events/runtime` |
| `@luckys_luis/nuxt-laravelize/queue` | `@nuxt-laravelize/queue/runtime` |
| `@luckys_luis/nuxt-laravelize/mail` | `@nuxt-laravelize/mail/runtime` |
| `@luckys_luis/nuxt-laravelize/notifications` | `@nuxt-laravelize/notifications/runtime` |
| `@luckys_luis/nuxt-laravelize/http` | `@nuxt-laravelize/http/runtime` |
| `@luckys_luis/nuxt-laravelize/database` | `@nuxt-laravelize/database/runtime` |
| `@luckys_luis/nuxt-laravelize/testing` | `@nuxt-laravelize/testing` |
| `Translator`, `DictionaryTranslator`, `translatorToken`, `__()` y `choice()` | `nuxt-i18n-micro`, `useI18n()`, `$t()` y `$tc()` |
| `useTranslator(event)` en un handler Nitro | `await useTranslationServerMiddleware(event)` |
| `selectPluralForm()` independiente del framework | Pluralizacion propia de la aplicacion o la opcion `i18n.plural` |
| APIs anteriores de listeners encolados | `@nuxt-laravelize/events-queue/runtime` |
| APIs anteriores de BullMQ | `@nuxt-laravelize/queue-bullmq/runtime` |
| Adapters de mail para Node | `@nuxt-laravelize/mail/node` |
| Comando `laravelize-queue-work` | Instala `@nuxt-laravelize/queue-bullmq` y proporciona `laravelize.queue.config.mjs` |
| Comando `laravelize-db-seed` | Instala `@nuxt-laravelize/database` y proporciona `laravelize.seed.config.mjs` |

Los fakes de testing tambien estan disponibles desde entrypoints especificos:

```ts
import { FakeLogger } from '@nuxt-laravelize/core/testing'
import { EventFake } from '@nuxt-laravelize/events/testing'
import { QueueFake } from '@nuxt-laravelize/queue/testing'
import { MailFake } from '@nuxt-laravelize/mail/testing'
import { NotificationFake } from '@nuxt-laravelize/notifications/testing'
```

Consulta la [guia de modulos y API](./modules.es.md) para ejemplos completos de cada paquete.

## Scheduler y Nitro

El scheduler es un paquete separado y `@nuxt-laravelize/nuxt` no lo activa:

```bash
pnpm add @nuxt-laravelize/scheduler
```

La API independiente del framework se exporta desde `@nuxt-laravelize/scheduler`. Su adapter experimental `@nuxt-laravelize/scheduler/nitro3` requiere exactamente `nitro@3.0.260610-beta`.

Nuxt 4 usa su propia dependencia Nitro 2. No instales Nitro 3 para reemplazar la version interna de Nuxt; usa el adapter solamente en una aplicacion Nitro 3 explicita.

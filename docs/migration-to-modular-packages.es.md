# Migracion a paquetes modulares

[English](./migration-to-modular-packages.md) | Espanol

La version modular se publica bajo el scope personal de npm `@luckys_luis`. Instala `@luckys_luis/nuxt-laravelize` para el stack estandar o selecciona paquetes individuales `@luckys_luis/nuxt-laravelize-*`. No existen reexports de compatibilidad ni comandos wrapper para la facade monolitica anterior.

## Elige una instalacion

Para el stack estandar, instala el preset:

```bash
pnpm add @luckys_luis/nuxt-laravelize
```

```ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize'],
})
```

Para una instalacion granular, agrega y declara solo los features que uses:

```bash
pnpm add @luckys_luis/nuxt-laravelize-events @luckys_luis/nuxt-laravelize-queue
```

```ts
export default defineNuxtConfig({
  modules: [
    '@luckys_luis/nuxt-laravelize-events',
    '@luckys_luis/nuxt-laravelize-queue',
  ],
})
```

Los modulos de features instalan y activan `@luckys_luis/nuxt-laravelize-core` transitivamente. No declares core por separado salvo que tu aplicacion use solamente ese modulo.

## Mapeos directos

| Paquete o subpath eliminado | Reemplazo |
|---|---|
| Entrada del facade anterior en `modules` | `@luckys_luis/nuxt-laravelize` o los paquetes seleccionados |
| Entrada anterior `/core` | `@luckys_luis/nuxt-laravelize-core/runtime` |
| Entrada anterior `/events` | `@luckys_luis/nuxt-laravelize-events/runtime` |
| Entrada anterior `/queue` | `@luckys_luis/nuxt-laravelize-queue/runtime` |
| Entrada anterior `/mail` | `@luckys_luis/nuxt-laravelize-mail/runtime` |
| Entrada anterior `/notifications` | `@luckys_luis/nuxt-laravelize-notifications/runtime` |
| Entrada anterior `/http` | `@luckys_luis/nuxt-laravelize-http/runtime` |
| Entrada anterior `/database` | `@luckys_luis/nuxt-laravelize-database/runtime` |
| Entrada anterior `/testing` | `@luckys_luis/nuxt-laravelize-testing` |
| `Translator`, `DictionaryTranslator`, `translatorToken`, `__()` y `choice()` | `nuxt-i18n-micro`, `useI18n()`, `$t()` y `$tc()` |
| `useTranslator(event)` en un handler Nitro | `await useTranslationServerMiddleware(event)` |
| `selectPluralForm()` independiente del framework | Pluralizacion propia de la aplicacion o la opcion `i18n.plural` |
| APIs anteriores de listeners encolados | `@luckys_luis/nuxt-laravelize-events-queue/runtime` |
| APIs anteriores de BullMQ | `@luckys_luis/nuxt-laravelize-queue-bullmq/runtime` |
| Adapters de mail para Node | `@luckys_luis/nuxt-laravelize-mail/node` |
| Comando `laravelize-queue-work` | Instala `@luckys_luis/nuxt-laravelize-queue-bullmq` y proporciona `laravelize.queue.config.mjs` |
| Comando `laravelize-db-seed` | Instala `@luckys_luis/nuxt-laravelize-database` y proporciona `laravelize.seed.config.mjs` |

Los fakes de testing tambien estan disponibles desde entrypoints especificos:

```ts
import { FakeLogger } from '@luckys_luis/nuxt-laravelize-core/testing'
import { EventFake } from '@luckys_luis/nuxt-laravelize-events/testing'
import { QueueFake } from '@luckys_luis/nuxt-laravelize-queue/testing'
import { MailFake } from '@luckys_luis/nuxt-laravelize-mail/testing'
import { NotificationFake } from '@luckys_luis/nuxt-laravelize-notifications/testing'
```

Consulta la [guia de modulos y API](./modules.es.md) para ejemplos completos de cada paquete.

## Scheduler y Nitro

El scheduler es un paquete separado y `@luckys_luis/nuxt-laravelize` no lo activa:

```bash
pnpm add @luckys_luis/nuxt-laravelize-scheduler
```

La API independiente del framework se exporta desde `@luckys_luis/nuxt-laravelize-scheduler`. Su adapter experimental `@luckys_luis/nuxt-laravelize-scheduler/nitro3` requiere exactamente `nitro@3.0.260610-beta`.

Nuxt 4 usa su propia dependencia Nitro 2. No instales Nitro 3 para reemplazar la version interna de Nuxt; usa el adapter solamente en una aplicacion Nitro 3 explicita.

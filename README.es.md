# Nuxt Laravelize

[English](./README.md) | Espanol

Nuxt Laravelize es un monorepo pnpm de paquetes enfocados `@nuxt-laravelize/*` para arquitectura de servidor inspirada en Laravel sobre Nuxt `>=4.3 <5`. Instala el preset para obtener el stack completo o selecciona solo las capacidades que necesita tu aplicacion.

## Paquetes

| Paquete | Proposito |
|---|---|
| `@nuxt-laravelize/cache` | Contrato cache portable, operaciones TTL, contadores, memoizacion y driver en memoria |
| `@nuxt-laravelize/core` | Contenedor, tokens, providers, lifecycle y logging |
| `@nuxt-laravelize/events` | Eventos y listeners sincronicos |
| `@nuxt-laravelize/queue` | Contratos de cola portables, jobs, ejecucion por scope y driver en memoria |
| `@nuxt-laravelize/queue-bullmq` | Driver BullMQ y worker persistente, solo para Node |
| `@nuxt-laravelize/events-queue` | Integracion de listeners encolados entre eventos y colas |
| `@nuxt-laravelize/mail` | Mailables, mail manager y transports |
| `@nuxt-laravelize/notifications` | Canales de notificacion y routing bajo demanda |
| `@nuxt-laravelize/http` | Cliente HTTP nativo de Nuxt, requests, middleware, URLs firmadas, resources, paginacion y autorizacion |
| `@nuxt-laravelize/database` | Factories y seeders independientes del ORM |
| `@nuxt-laravelize/testing` | Test harness agregado y fakes |
| `@nuxt-laravelize/scheduler` | Schedules independientes del framework y adapter Nitro 3 explicito |
| `@nuxt-laravelize/nuxt` | Preset conveniente con integracion de `nuxt-i18n-micro` |

## Instalacion

### Preset Nuxt completo

```bash
pnpm add @nuxt-laravelize/nuxt
```

```ts
import Laravelize from '@nuxt-laravelize/nuxt'

export default defineNuxtConfig({
  modules: [Laravelize],
  i18n: {
    locales: [{ code: 'es', iso: 'es-ES', dir: 'ltr' }],
    defaultLocale: 'es',
    translationDir: 'locales',
  },
})
```

El preset activa cache, core, database, events, queued listeners, HTTP, mail, notifications, la cola portable y `nuxt-i18n-micro`. Las traducciones usan su API nativa de Nuxt `$t()` y diccionarios JSON en lugar de `__()` al estilo Laravel. No instala BullMQ ni activa el scheduler.

```vue
<template>
  <p>{{ $t('welcome', { name: 'Ada' }) }}</p>
</template>
```

### Features granulares

Instala y declara solo los modulos Nuxt que uses:

```bash
pnpm add @nuxt-laravelize/events @nuxt-laravelize/http
```

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxt-laravelize/events',
    '@nuxt-laravelize/http',
  ],
})
```

Los modulos de features instalan y activan `@nuxt-laravelize/core` transitivamente. Agrega adapters por separado cuando sean necesarios:

```bash
pnpm add @nuxt-laravelize/queue @nuxt-laravelize/queue-bullmq
pnpm add @nuxt-laravelize/events @nuxt-laravelize/queue @nuxt-laravelize/events-queue
pnpm add -D @nuxt-laravelize/testing
```

## Entrypoints publicos

La raiz de cada paquete es el entrypoint del modulo Nuxt salvo que se indique lo contrario. El codigo de aplicacion debe usar estos subpaths publicos en lugar de internals del paquete.

| Paquete | Entrypoints de runtime y adapters | Entrypoint de testing |
|---|---|---|
| `@nuxt-laravelize/cache` | `/runtime` | `/testing` |
| `@nuxt-laravelize/core` | `/runtime`, `/runtime/server`, `/kit` | `/testing` |
| `@nuxt-laravelize/events` | `/runtime` | `/testing` |
| `@nuxt-laravelize/queue` | `/runtime` | `/testing` |
| `@nuxt-laravelize/queue-bullmq` | `/runtime` | - |
| `@nuxt-laravelize/events-queue` | `/runtime` | - |
| `@nuxt-laravelize/mail` | `/runtime`, `/node` | `/testing` |
| `@nuxt-laravelize/notifications` | `/runtime` | `/testing` |
| `@nuxt-laravelize/http` | `/runtime` | - |
| `@nuxt-laravelize/database` | `/runtime` | - |
| `@nuxt-laravelize/testing` | Raiz del paquete | Raiz del paquete |
| `@nuxt-laravelize/scheduler` | Raiz del paquete, `/nitro3` | - |
| `@nuxt-laravelize/nuxt` | Raiz del paquete | - |

Ejemplos:

```ts
import { createToken } from '@nuxt-laravelize/core/runtime'
import { mountLaravelize } from '@nuxt-laravelize/testing'
import { NodemailerMailer } from '@nuxt-laravelize/mail/node'
```

## Limite del scheduler

`@nuxt-laravelize/scheduler` es independiente del framework y no forma parte de `@nuxt-laravelize/nuxt`. Su adapter `/nitro3` apunta exactamente a `nitro@3.0.260610-beta`.

Nuxt 4 gestiona actualmente su dependencia de Nitro 2. No instales Nitro 3 en una aplicacion Nuxt 4 ni uses el adapter del scheduler para reemplazar la version interna de Nitro de Nuxt. Usa `/nitro3` solo en una aplicacion Nitro 3 explicita que cumpla su version peer.

## Desarrollo

```bash
pnpm install
pnpm build:packages   # construye todos los paquetes del workspace
pnpm test:packages    # ejecuta los tests de los paquetes
pnpm typecheck        # comprueba tipos en la raiz y los paquetes
pnpm lint             # ejecuta el lint del monorepo
pnpm pack:test        # construye tarballs y ejecuta smoke tests
pnpm dev              # prepara e inicia el playground Nuxt
```

Los releases usan Changesets:

```bash
pnpm changeset
pnpm version-packages
pnpm release:packages
```

Consulta [Migracion a paquetes modulares](./docs/migration-to-modular-packages.es.md) al actualizar una aplicacion anterior.

## Documentacion

- [Guia de modulos y API](./docs/modules.es.md): instalacion, APIs publicas y ejemplos para cada paquete.
- [Guia de modulos y API en ingles](./docs/modules.md): la misma referencia en ingles.
- [Guia de migracion](./docs/migration-to-modular-packages.es.md): reemplazos para la facade legacy eliminada.

## Licencia

MIT

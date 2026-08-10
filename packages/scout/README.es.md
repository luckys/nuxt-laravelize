# `@luckys_luis/nuxt-laravelize-scout`

[English](./README.md) | Espanol

Contratos de busqueda portables, motores nombrados, queries fluidas e indexacion por lotes

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-scout
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-scout'],
})
```


## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |

## Busqueda Scout

`@luckys_luis/nuxt-laravelize-scout` ofrece contratos portables para modelos y motores, builder fluido, importacion por lotes y el auto-import de servidor `useScout(event)`. Configura `laravelizeScout.driver` (por defecto: `memory`). Los motores tienen nombre, se crean de forma diferida y se cachean; registra adapters en un provider antes de seleccionarlos. `@luckys_luis/nuxt-laravelize-scout-drizzle` ofrece helpers para PostgreSQL, SQLite local y Turso/libSQL mediante `/postgres`, `/sqlite` y `/turso`.

```ts
const scout = useScout(event)
const results = await scout.search('articles', 'cuidados de apoyo')
  .where('status', 'published')
  .whereIn('locale', ['en', 'es'])
  .orderBy('published_at', 'desc')
  .paginate(1, 20)

registerDrizzlePostgresDriver(scout, 'postgres', db, allowlists)
scout.use('postgres')
```

SQLite local y Turso usan la misma API de Scout con registros separados:

```ts
import { registerDrizzleSQLiteDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/sqlite'
import { registerTursoDriver } from '@luckys_luis/nuxt-laravelize-scout-drizzle/turso'

registerDrizzleSQLiteDriver(scout, 'sqlite', sqliteDb, allowlists)
registerTursoDriver(scout, 'turso', tursoClient, allowlists)
scout.use('turso')
```

Los modelos implementan `searchableKey()`, `searchableType()` y `toSearchableDocument()`. Usa `update`, `delete`, `import` y `flush` para mantener el indice. PostgreSQL usa `websearch_to_tsquery` y `tsvector` con GIN; SQLite/libSQL usan FTS5 y JSON1. Todos parametrizan valores, deniegan por defecto campos de filtro/orden y hacen atomica la sincronizacion multi-escritura cuando el cliente soporta transacciones. La paginacion esta limitada a 100 y la importacion a 10.000 documentos por lote. SQLite/libSQL requiere FTS5; aplica `0001_create_scout_documents_sqlite.sql`. Autoriza el acceso antes de usar Scout y no indexes secretos ni datos personales innecesarios.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#busqueda-scout). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-scout-drizzle`](../scout-drizzle/README.es.md), [`@luckys_luis/nuxt-laravelize-authorization`](../authorization/README.es.md).

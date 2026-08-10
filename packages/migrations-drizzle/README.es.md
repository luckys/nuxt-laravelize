# `@luckys_luis/nuxt-laravelize-migrations-drizzle`

[English](./README.md) | Espanol

Backends PostgreSQL/SQLite y fuentes agregadas de migraciones

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-migrations-drizzle @luckys_luis/nuxt-laravelize-migrations drizzle-orm
```

## Uso especifico del package

El package expone una superficie pequena y explicita. Configura sus dependencias desde un provider o adapter de la aplicacion y prueba los limites antes de promoverlo a produccion.

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./postgres` | Entrypoint publico de este package. |
| `./sqlite` | Entrypoint publico de este package. |
| `./sources` | Entrypoint publico de este package. |
| `./migrations` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |
| `./migrations/*` | Entrypoint publico de este package. |

## Migraciones

`@luckys_luis/nuxt-laravelize-migrations` es neutral al ORM. Las fuentes son explicitas y los IDs usan `namespace:name`; no se escanean dependencias. Antes de mutar, el runner valida dialectos, dependencias, ciclos, IDs duplicados, historial aplicado y checksums. `up`, `rollback`, `reset` y `fresh` seleccionan trabajo bajo el lock del backend, y cada statement junto con su historial comparte una transaccion. Las migraciones irreversibles rechazan rollback. `fresh` exige un allowlist exacto de ownership y nunca inspecciona objetos ajenos.

`@luckys_luis/nuxt-laravelize-migrations-drizzle` aporta backends PostgreSQL y SQLite. PostgreSQL exige una conexion fijada para que advisory lock, SQL e historial compartan sesion y transaccion. SQLite usa transacciones immediate locales al callback. `migrationSourcesFor(dialect)` agrega explicitamente fuentes de audit, idempotency, reliability, Scout y workflows. `discoverApplicationMigrations()` carga fuentes de aplicacion desde paths entregados por el caller.

```ts
const runner = new MigrationRunner({
  dialect: 'postgresql',
  backend: new PostgresMigrationBackend(connectionProvider),
  sources: [...migrationSourcesFor('postgresql'), appMigrations],
})

await runner.up()
```

El entrypoint `/console` aporta `migrate:status`, `migrate:up`, `migrate:rollback`, `migrate:reset`, `migrate:fresh` y `migrate:pretend`. Los comandos destructivos exigen confirmacion interactiva afirmativa.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#migraciones). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-migrations`](../migrations/README.es.md), [`@luckys_luis/nuxt-laravelize-audit-drizzle`](../audit-drizzle/README.es.md), [`@luckys_luis/nuxt-laravelize-reliability-drizzle`](../reliability-drizzle/README.es.md).

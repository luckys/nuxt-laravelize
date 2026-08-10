# `@luckys_luis/nuxt-laravelize-audit`

[English](./README.md) | Espanol

Auditoria append-only segura enriquecida por el contexto de ejecucion

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-audit
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-audit'],
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
| `./runtime/server` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Auditoria

`@luckys_luis/nuxt-laravelize-audit` esta incluido en el preset y expone `useAudit(event)`. El registro es explicito. El recorder genera ID y fecha y enriquece actor, tenant, ejecucion, correlacion, causacion, source y trace desde el contexto confiable; el caller no puede reemplazarlos.

Actions y referencias usan identificadores seguros y acotados. Changes y metadata solo aceptan JSON plano acotado. Se rechazan funciones, symbols, ciclos, prototipos personalizados y limites excesivos. Las claves comunes de credenciales y las configuradas se convierten en `[REDACTED]`.

El preset usa memoria acotada y sin eviction en desarrollo, y persistencia deshabilitada en produccion; ambos avisan y el modo deshabilitado falla cerrado. Configura `laravelizeAudit.driver: 'memory'` explicitamente solo si la volatilidad es aceptable, o reemplaza `auditStoreToken` por almacenamiento durable. `requireTenantId: true` exige tenant confiable. `@luckys_luis/nuxt-laravelize-audit-drizzle` es append-only por interfaz; al actualizar aplica `0002_add_audit_locale.sql` o `0003_add_audit_locale_sqlite.sql` para conservar el locale confiable del execution context como columna de primera clase. La inmutabilidad real requiere credenciales de minimo privilegio y controles de retencion. `occurredAt` es tiempo de aplicacion, no orden autoritativo de ingestion.

Audit no es logging ni serializacion de domain events. No se pasan bodies request/response ni modelos arbitrarios. La auditoria automatica policy/HTTP queda para un futuro bridge neutral `audit-http`.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#auditoria). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-audit-drizzle`](../audit-drizzle/README.es.md), [`@luckys_luis/nuxt-laravelize-execution-context`](../execution-context/README.es.md).

# `@luckys_luis/nuxt-laravelize-authorization`

[English](./README.md) | Espanol

Habilidades y politicas centralizadas con principal por scope

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-authorization
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-authorization'],
})
```


## Uso especifico del package


### Registra y evalua una ability

Registra abilities y policies de recursos durante el boot y resuelve el authorizer scoped en el boundary de la aplicacion. El resolver de principal por defecto deniega hasta que la aplicacion aporte un principal confiable y actual.

```ts
import { authorizationRegistryToken } from '@luckys_luis/nuxt-laravelize-authorization/runtime'

const registry = container.make(authorizationRegistryToken)
registry.registerAbility('invoice.view', ({ principal, tenantId }) => {
  return Boolean(principal && tenantId && membershipAllows(principal, tenantId, 'invoice.view'))
})

const authorization = useAuthorization(event)
if (!await authorization.allows('invoice.view')) throw createError({ statusCode: 403 })
```

## Entrypoints publicos

Usa solo estos entrypoints publicos. Las rutas no listadas son internals y pueden cambiar sin aviso.

| Entrypoint | Uso |
|---|---|
| `package root` | Entrypoint publico de este package. |
| `./runtime` | Entrypoint publico de este package. |
| `./runtime/server` | Entrypoint publico de este package. |
| `./testing` | Entrypoint publico de este package. |

## Autorizacion

`@luckys_luis/nuxt-laravelize-authorization` esta incluido en el preset. Su core no depende de H3: resuelve `authorizationToken` en scopes HTTP, queues, workflows o CLI, y usa el autoimport `useAuthorization(event)` solo en el borde HTTP. Las abilities globales y policies de recursos se registran una vez mediante el singleton `authorizationRegistryToken`; los tipos de recurso usan keys estables explicitas y los duplicados fallan inmediatamente.

El authorizer scoped llama al `principalResolverToken` reemplazable para recargar el principal vigente. Los snapshots propagados o serializados son metadata, nunca credenciales. En contextos de queue, un principal ordinario se deniega centralmente y actor/tenant serializados nunca llegan a las abilities. Devuelve `trustQueuePrincipal(principal, { actor, tenantId })` solo despues de que la aplicacion autentique independientemente la delegacion o identidad actual del worker, incluyendo actor y tenant opcional. Un wrapper solo con principal se deniega y los valores confiables no deben copiarse de claims del envelope sin verificacion independiente. El resolver por defecto no devuelve principal y por ello deniega. `inspect` devuelve una decision tipada y acotada; `allows`, `denies`, `authorize`, `any` y `none` agregan conveniencia. El nombre de ability de recurso `before` esta reservado para el hook de policy; la accion solicitada debe existir antes de ejecutar el hook y `null`/`undefined` significa continuar. Los errores portables no dependen de H3; el borde HTTP debe mapear denegaciones a 403.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#autorizacion). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-authorization-queue`](../authorization-queue/README.es.md), [`@luckys_luis/nuxt-laravelize-http`](../http/README.es.md).

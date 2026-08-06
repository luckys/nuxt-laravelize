# `@nuxt-laravelize/routes`

[English](./README.md) | Espanol

Helpers de URL tipados generados desde declaraciones explicitas

## Instalacion

```bash
pnpm add @nuxt-laravelize/routes
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt-laravelize/routes'],
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
| `./kit` | Entrypoint publico de este package. |

## Rutas tipadas

`@nuxt-laravelize/routes` genera `#laravelize/routes` desde declaraciones explicitas y esta incluido en el preset. Solo infiere parametros de URL y metodos HTTP; intencionalmente **no infiere** bodies de request ni responses.

```ts
// routes.ts
import { route } from '@nuxt-laravelize/routes/runtime'

export default {
  users: {
    show: route('GET', '/users/{user}/{section?}'),
    files: route('GET', '/users/{user}/files/{path+}'),
    browse: route('GET', '/files/{path*}'),
  },
} as const
```

El archivo convencional `routes.ts` se carga automaticamente. Configura `laravelizeRoutes.declarations` para otros archivos explicitos y `baseURL` para un prefijo comun. Usa `{id}` para valores obligatorios, `{id?}` para opcionales, `{path+}` para un catch-all obligatorio no vacio y `{path*}` para uno opcional.

```ts
import routes from '#laravelize/routes'

routes.users.show({ user: 42 }, { query: { preview: true } })
// { method: 'GET', url: '/users/42?preview=1' }
```

Los valores de path se codifican. Los arrays catch-all conservan sus segmentos, mientras `.` y `..` se rechazan para impedir URLs con traversal. Las keys query se ordenan, los arrays conservan su orden, los booleanos usan `1`/`0` y los valores nullish se omiten. Los autores de paquetes pueden registrar declaraciones con `addRoutesDeclaration()` desde `@nuxt-laravelize/routes/kit`.

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#rutas-tipadas). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@nuxt-laravelize/http`](../http/README.es.md), [`@nuxt-laravelize/nuxt`](../nuxt/README.es.md).

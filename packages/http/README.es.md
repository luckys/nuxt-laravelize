# `@luckys_luis/nuxt-laravelize-http`

[English](./README.md) | Espanol

Cliente HTTP nativo de Nuxt, requests, middleware, URLs firmadas, resources, paginacion y autorizacion

## Instalacion

```bash
pnpm add @luckys_luis/nuxt-laravelize-http
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-http'],
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

## HTTP

`@luckys_luis/nuxt-laravelize-http` proporciona el cliente Nuxt autoimportado `useHttp`, requests, middleware, resources, paginacion, gates y policies para Nitro.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@luckys_luis/nuxt-laravelize-http'],
  laravelizeHttp: {
    baseURL: 'https://api.example.com',
    signingKey: '',
    signingOrigin: 'https://app.example.com',
  },
})
```

Genera al menos 32 bytes aleatorios con `openssl rand -base64 32` y define la clave privada mediante `NUXT_LARAVELIZE_HTTP_SIGNING_KEY`. Nunca la coloques bajo `runtimeConfig.public` ni incluyas una clave de produccion en el repositorio. `signingOrigin` proporciona un origen canonico permitido en vez de confiar en `Host` y headers de protocolo reenviados por el request.

```ts
const { data, error, status, refresh } = await useHttp<User>('/users/1')
const { data: created } = await useHttp<User>('/users', {
  method: 'POST',
  body: { name: 'Ada' },
})
```

### Form requests y handlers

`FormRequest.body()`, `query()` y `params()` aceptan cualquier implementacion Standard Schema. `authorize(event)` devuelve un boolean. `defineLaravelizedHandler()` resuelve un controller token, ejecuta middleware global y de ruta, valida el input y serializa resources.

El ejemplo usa Zod como implementacion Standard Schema: `pnpm add zod`.

```ts
import { createToken } from '@luckys_luis/nuxt-laravelize-core/runtime'
import { FormRequest, LengthAwarePaginator, Resource, defineLaravelizedHandler, type ValidatedInput } from '@luckys_luis/nuxt-laravelize-http/runtime'
import { z } from 'zod'

class CreateUserRequest extends FormRequest {
  body() { return z.object({ name: z.string().min(1) }) }
  authorize() { return true }
}

class UserResource extends Resource<{ id: string, name: string }> {
  toArray() { return { id: this.resource.id, name: this.resource.name } }
}

class UserController {
  async store(input: ValidatedInput<CreateUserRequest>) {
    return new UserResource({ id: 'user_1', name: input.body.name })
  }
}

const userControllerToken = createToken<UserController>('controllers.users')

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'store',
  request: CreateUserRequest,
})
```

Implementa `Middleware.handle(event, next)` y registra su token en el array `middleware` del handler. `globalMiddlewareToken` contiene tokens aplicados a todos los handlers Laravelized.

### URLs firmadas y temporales

`HmacUrlSigner` protege origen, path y query con HMAC-SHA256. El servicio configurado esta disponible mediante `useUrlSigner(event)` y `urlSignerToken`.

```ts
// server/api/invitations/[id]/link.get.ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const target = new URL(`/api/invitations/${getRouterParam(event, 'id')}`, signingOrigin)
  const url = await useUrlSigner(event).sign(target, {
    expiresAt: Date.now() + 30 * 60 * 1000,
  })
  return { url }
})
```

Protege un handler Laravelized con el autoimport `validateSignatureToken`:

```ts
export default defineLaravelizedHandler({
  controller: invitationControllerToken,
  method: 'accept',
  middleware: [validateSignatureToken],
})
```

Usa el mismo middleware en un handler Nitro normal:

```ts
export default defineEventHandler(async (event) => {
  const { signingOrigin } = useRuntimeConfig().laravelizeHttp
  const middleware = new ValidateSignature(useUrlSigner(event), { origin: signingOrigin })
  return await middleware.handle(event, async () => ({ accepted: true }))
})
```

| API | Proposito |
|---|---|
| `HmacUrlSigner(secret)` | Crea un signer HMAC-SHA256 portable con Web Crypto. Claves menores de 32 bytes lanzan `MissingUrlSigningKeyError`. |
| `sign(url, options?)` | Reemplaza una firma; sus opciones soportan expiracion, modo relativo y binding al metodo HTTP. |
| `hasValidSignature(url, options?)` | Rechaza firmas ausentes, mal formadas, manipuladas o expiradas y puede exigir expiracion. |
| `ValidateSignature` | Middleware que rechaza requests invalidos con HTTP 403; soporta origen canonico, expiracion obligatoria y binding al metodo. |
| `urlSignerToken` / `useUrlSigner(event)` | Resuelve el signer configurado desde el contenedor del request. |
| `validateSignatureToken` | Middleware por defecto para firmas absolutas; resolverlo exige `signingOrigin`. |

La firma absoluta es el modo por defecto e incluye el origen. Para links independientes del proxy, usa `{ absolute: false }` tanto al firmar como al validar; el modo relativo protege solo path y query y no debe cruzar limites de tenants basados en host. El orden del query se normaliza, los fragments se ignoran porque el navegador no los envia al servidor y una URL temporal deja de ser valida en su segundo exacto de expiracion. Rotar la clave invalida links existentes.

Las URLs firmadas son credenciales bearer y pueden reutilizarse. Usa expiraciones cortas para verificacion, invitaciones y acciones con cambios de estado; liga esas firmas al metodo HTTP con `sign(..., { method: 'POST' })` y `new ValidateSignature(signer, { bindMethod: true, requireExpiration: true })`. Exige HTTPS en un proxy confiable y usa storage de la aplicacion cuando un link deba ser de un solo uso.

### Idempotencia HTTP

`@luckys_luis/nuxt-laravelize-idempotency` proporciona un middleware H3 opt-in y un contrato de store atomico para requests con mutaciones. El fingerprint incluye metodo, ruta y query canonicos, principal, content type y bytes exactos del request. Reutilizar una clave con otro fingerprint devuelve `409`; los leases activos se renuevan y un owner obsoleto no puede completar trabajo reclamado. Las respuestas completadas se reproducen con una allowlist de headers seguros. Los fallos se conservan por defecto porque reintentar tras un error ambiguo puede duplicar efectos ya confirmados.

```ts
import { createIdempotencyMiddleware } from '@luckys_luis/nuxt-laravelize-idempotency/runtime'

const idempotency = createIdempotencyMiddleware({
  principal: event => event.context.user.id,
})
```

El driver memory es volatil y debe habilitarse explicitamente. Despliegues cluster o serverless deben ligar un `IdempotencyStore` durable y atomico. Streaming y escrituras directas se rechazan porque no pueden reproducirse fielmente.

Para almacenamiento durable, `@luckys_luis/nuxt-laravelize-idempotency-drizzle` proporciona adapters PostgreSQL, SQLite y Turso, schemas y migraciones explicitas. PostgreSQL acepta el boundary `execute(SQL)` de Drizzle; SQLite/Turso aceptan `all(SQL)` para que las sentencias condicionales `UPSERT/UPDATE ... RETURNING` devuelvan la fila protegida. Aplica exactamente una migracion compatible antes de ligar el token del store.

```ts
import { DrizzlePostgresIdempotencyStore } from '@luckys_luis/nuxt-laravelize-idempotency-drizzle/postgres'

container.singleton(idempotencyStoreToken, () => new DrizzlePostgresIdempotencyStore(db))
```

Los nombres de query `signature` y `expires` estan reservados. La firma reemplaza `signature`; pasa `expiresAt` explicitamente para crear o reemplazar `expires`.

### Resources y paginacion

| API | Proposito |
|---|---|
| `Resource.toArray(event)` | Transforma un valor. Usa `when()` y `mergeWhen()` para campos condicionales. |
| `Resource.collection(items)` | Crea una coleccion normal o paginada. |
| `withoutWrapping()` / `restoreWrapping()` | Desactiva o restaura globalmente el wrapper `{ data: ... }`. |
| `ResourceCollection.toArray()` | Serializa cada resource. |
| `LengthAwarePaginator` | Agrega totales, metadata y links; `fromRequest()` lee query params. |
| `SimplePaginator` | Ofrece links anterior/siguiente sin total. |
| `CursorPaginator` | Ofrece navegacion por cursor codificado. |
| `parsePageParams()` / `parseCursorParams()` | Lee y limita parametros de paginacion. |
| `encodeCursor()` / `decodeCursor()` | Convierte cursores a y desde strings seguros para URLs. |
| `buildPageUrl()` / `buildCursorUrl()` / `getRequestPath()` | Construye links preservando path y query. |
| `isPaginator()` y guards de resources | Estrechan tipos en runtime. |

```ts
const paginator = LengthAwarePaginator.fromRequest(event, users, total, {
  defaultPerPage: 15,
  maxPerPage: 100,
})
return UserResource.collection(paginator)
```

### Gates y policies

Estas APIs HTTP se conservan por compatibilidad concreta. El codigo nuevo debe usar `@luckys_luis/nuxt-laravelize-authorization`: en lugar del lookup legacy por nombre de constructor y el user suministrado por el caller, usa keys de recurso explicitas y recarga el principal scoped. El `authorize()` legacy mantiene su mapping 403 especifico de H3.

| API | Proposito |
|---|---|
| `define(rule, callback)` | Registra una regla de autorizacion. |
| `allows()` / `denies()` | Comprueba una regla. |
| `authorize()` | Lanza un error H3 403 cuando se deniega. |
| `any()` / `none()` | Comprueba varias reglas. |
| `DefaultPolicyRegistry.register(modelName, policy)` | Registra una policy para el nombre del constructor del modelo. |
| `Policy.before(user)` | Permite o deniega opcionalmente todas las acciones antes de su metodo. |
| `discoverPoliciesByConvention(rootDir)` | Encuentra archivos de policies para adapters. |

```ts
import { InMemoryGate } from '@luckys_luis/nuxt-laravelize-http/runtime'

const gate = new InMemoryGate()
gate.define('update-invoice', (user, invoice) => user.id === invoice.ownerId)
await gate.authorize('update-invoice', currentUser, invoice)
```

## Compatibilidad y limites

Respeta las advertencias de entrega at-least-once, durabilidad, autorizacion, aislamiento de tenant y secretos que aparecen en la seccion de referencia. Los ejemplos no sustituyen la autenticacion, autorizacion ni validacion del servidor.

La referencia compartida de APIs y decisiones de seguridad esta en la [guia de modulos](../../docs/modules.es.md#http). Esta pagina resume el contrato de este package y mantiene ejemplos copy-pasteables.

## Paquetes relacionados

[`@luckys_luis/nuxt-laravelize-validation`](../validation/README.es.md), [`@luckys_luis/nuxt-laravelize-authorization`](../authorization/README.es.md), [`@luckys_luis/nuxt-laravelize-idempotency`](../idempotency/README.es.md), [`@luckys_luis/nuxt-laravelize-routes`](../routes/README.es.md).

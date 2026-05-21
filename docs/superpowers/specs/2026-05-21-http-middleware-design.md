# F2-A — HTTP Middleware (Design Spec)

**Estado:** propuesto
**Depende de:** F0-A, F0-B, F1
**Próximas fases sobre la misma capa:** F2-B (route binding), F2-C (resources), F2-D (authorization)

## 1. Contexto y motivación

F1 dejó operativa la capa HTTP básica: `defineLaravelizedHandler` resuelve un controller del container DI, valida la entrada con un `FormRequest` opcional y llama al método. Falta el patrón Laravel-style de envolver la ejecución del controller con un **pipeline de middleware** que pueda interceptar/modificar request y response: autenticación, logging, rate-limit, CORS, etc.

F2-A añade ese pipeline. NO añade route binding, resources ni authorization — esos van en F2-B/C/D.

## 2. Alcance

### Incluido en F2-A

- Interfaz `Middleware` con un único método `handle(event, next)` (sync o async).
- Función pura `runMiddlewarePipeline(event, middlewares, terminal)` que compone la cadena Koa-style.
- Token público `globalMiddlewareToken` que el usuario registra desde un `ServiceProvider` con `container.instance(globalMiddlewareToken, [token1, token2])`.
- Extensión de `defineLaravelizedHandler` con un nuevo campo opcional `middleware?: readonly Token<Middleware>[]` (per-handler).
- Orden de ejecución: globales → per-handler → terminal (validación + controller).
- Auto-import de `Middleware` interface en `server/middleware/*.ts`.

### Fuera de F2-A (fases posteriores)

- Module option `laravelize.middleware` en `nuxt.config.ts` (declarativo).
- Kit helper `addLaravelizeGlobalMiddleware(nuxt, token)` para que otros módulos contribuyan.
- Grupos nombrados (`api`, `web`) estilo Laravel.
- Middleware params (`middleware: ['throttle:60,1']`).
- `terminate()` hook (after-response).
- Route binding como middleware.
- Authorization (`authorize()` en FormRequest, gates/policies).

## 3. Decisiones de diseño

| Decisión | Elección | Razón |
|---|---|---|
| Forma del middleware | Clase con `handle(event, next)` resuelta por token DI | Consistente con F1 controllers; permite dependencies inyectadas |
| Pipeline | Koa-style: `m0(event, () => m1(event, () => ... terminal()))` | Estándar y trivial de componer; permite around (pre + post) |
| Identificación | Token DI (`Token<Middleware>`) | Consistente con F0/F1; tipado fuerte |
| Globales | `container.instance(globalMiddlewareToken, [tokens])` en un provider | YAGNI: sin module option ni kit helper; el usuario lo declara como cualquier otro servicio |
| Default sin globales | `container.has(token)` → `[]` si no registrado | Graceful: F1 sigue funcionando sin tocar nada |
| Orden | Globales primero, luego per-handler, luego terminal | Pre-existente en Laravel; predecible |
| Comportamiento sin `next()` | Return del middleware es la respuesta final | Permite redirects/forbidden/cached responses |
| Double `next()` | Lanza `Error('next() called multiple times')` desde el pipeline | Bug del usuario, falla rápido |

## 4. Arquitectura

### 4.1 Estructura de `src/`

```
core/, discovery/, kit.ts        # F0 — sin cambios
module.ts                        # F0-B — sin cambios

http/                            # F1 + F2-A
  FormRequest.ts                 # F1
  ValidatedInput.ts              # F1
  validateFormRequest.ts         # F1
  Middleware.ts                  # F2-A — interfaz
  MiddlewarePipeline.ts          # F2-A — runMiddlewarePipeline (función pura)
  GlobalMiddleware.ts            # F2-A — exporta globalMiddlewareToken
  defineLaravelizedHandler.ts    # F1 — MODIFICADO en F2-A: integra pipeline
  index.ts                       # MODIFICADO: re-exports

runtime/server/http/index.ts     # MODIFICADO: añade Middleware al auto-import
```

Sin cambios en `module.ts`, `kit.ts`, `discovery/`, `core/`, `runtime/plugin.ts`, `nitro/plugin.ts`. F2-A es 100% aditivo dentro del bounded context `http/`.

### 4.2 Flujo de request

```
HTTP request
   │
   ▼
defineLaravelizedHandler ── h3 EventHandler
   │
   ├─ useContainer(event)                              [F0]
   ├─ globals = container.has(globalMiddlewareToken)
   │              ? container.make(globalMiddlewareToken)
   │              : []
   ├─ perHandler = options.middleware ?? []
   ├─ tokens = [...globals, ...perHandler]
   ├─ middlewares = tokens.map(t => container.make(t))
   ▼
runMiddlewarePipeline(event, middlewares, async () => {
   │
   ├─ input = options.request
   │           ? await validateFormRequest(event, new options.request())  [F1]
   │           : { body: undefined, query: undefined, params: undefined }
   ├─ controller = container.make(options.controller)
   └─ return await controller[options.method](input)
})
   │
   ▼
response (cualquier valor JSON-serializable)
```

## 5. Componentes

### 5.1 `Middleware` (interface)

```ts
import type { H3Event } from 'h3'

export interface Middleware {
  handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> | unknown
}
```

`handle` puede ser sync o async; el pipeline siempre envuelve con `await`. El segundo argumento `next` continúa la cadena. Si `handle` no llama `next()`, su return value es la respuesta final.

### 5.2 `runMiddlewarePipeline` (función pura)

```ts
export async function runMiddlewarePipeline(
  event: H3Event,
  middlewares: readonly Middleware[],
  terminal: () => Promise<unknown>,
): Promise<unknown>
```

Composición Koa-style con guard de double-`next()`. Comportamiento:

- Pipeline vacío → ejecuta `terminal()` y devuelve su valor.
- Cada middleware recibe un `next` lambda que llama recursivamente al siguiente.
- Si un middleware no llama `next()`, su return es la respuesta final.
- Si llama `next()` y modifica el valor retornado, la modificación se preserva (around pattern).
- Llamar `next()` dos veces lanza `Error('next() called multiple times')`.

### 5.3 `globalMiddlewareToken`

```ts
import type { Token } from '../core/container/Token'
import { createToken } from '../core/container/Token'
import type { Middleware } from './Middleware'

export const globalMiddlewareToken = createToken<readonly Token<Middleware>[]>('laravelize.globalMiddleware')
```

El usuario lo registra en un `ServiceProvider` con `container.instance(globalMiddlewareToken, [...])`. Si nadie lo registra, el adapter usa `[]`.

### 5.4 `defineLaravelizedHandler` extendido

```ts
interface LaravelizedHandlerOptions<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
> {
  controller: Token<TController>
  method: TMethod
  request?: new () => TRequest
  middleware?: readonly Token<Middleware>[]   // NEW
}
```

Body del adapter:

```ts
return defineEventHandler(async (event) => {
  const container = useContainer(event)
  const globalTokens = container.has(globalMiddlewareToken) ? container.make(globalMiddlewareToken) : []
  const perHandlerTokens = options.middleware ?? []
  const middlewares = [...globalTokens, ...perHandlerTokens].map(token => container.make(token))

  return await runMiddlewarePipeline(event, middlewares, async () => {
    const controller = container.make(options.controller)
    const input = options.request
      ? await validateFormRequest(event, new options.request())
      : { body: undefined, query: undefined, params: undefined }
    const method = controller[options.method] as (input: unknown) => unknown
    return await method.call(controller, input)
  })
})
```

## 6. Manejo de errores

| Caso | Resultado |
|---|---|
| `next()` llamado dos veces dentro de un middleware | `Error('next() called multiple times')` lanzado desde el pipeline |
| Middleware token no registrado | `ServiceNotRegisteredError` (F0) propaga, h3 responde 500 |
| Middleware lanza dentro de `handle` | Propaga sin captura; el pipeline h3 maneja |
| Middleware no llama `next()` ni retorna valor | El pipeline retorna `undefined` (respuesta vacía válida) |
| Globales lista vacía o `globalMiddlewareToken` ausente | Solo per-handler corren |

F2-A NO introduce errores tipados nuevos. La consistencia con F1 es usar `createError` de h3 o las clases de F0 cuando aplique.

## 7. Testing

### 7.1 Unitarios (`test/http/`, sin Nuxt, Vitest)

- `MiddlewarePipeline.test.ts` — función pura, mock de `H3Event` plano + middleware fakes:
  - Pipeline vacío ejecuta terminal y devuelve su valor.
  - Un middleware llama `next()` → terminal corre y se devuelve su valor.
  - Múltiples middleware ejecutan en orden de llegada (verificar con array de eventos).
  - Middleware corta cadena (no llama `next`) → terminal NO corre, su return es la respuesta.
  - Around pattern: middleware modifica el response post-`next()` y la modificación se preserva.
  - Double `next()` lanza con el mensaje específico.

- `defineLaravelizedHandler.test.ts` (extender los 3 existentes con 4 nuevos):
  - Per-handler middleware ejecuta antes que el controller.
  - Globales registrados via `container.instance(globalMiddlewareToken, [...])` ejecutan antes de per-handler.
  - Globales + per-handler combinan en orden correcto.
  - Si `globalMiddlewareToken` no registrado → solo per-handler ejecuta; sin error.

### 7.2 Integración (`test/integration/`, `@nuxt/test-utils`)

Extender el playground con:
- `playground/server/middleware/LoggingMiddleware.ts` — clase con `handle(event, next)` que añade un header `x-laravelize-logged: true` a la respuesta y llama `next()`.
- `playground/server/middleware/BlockingMiddleware.ts` — devuelve `createError(403)` sin llamar `next()`.
- Provider que registra ambos middlewares + `container.instance(globalMiddlewareToken, [loggingMiddlewareToken])`.
- Un endpoint nuevo `playground/server/api/protected.get.ts` que usa BlockingMiddleware per-handler.

Tests:
- GET `/api/laravelize` (existing) → respuesta incluye `x-laravelize-logged` header (global aplicado).
- GET `/api/protected` → 403, controller NO ejecutado.

### 7.3 Metodología

TDD estricto: test → ver fallar → implementar → ver pasar → commit.

## 8. Convenciones de código

Reglas del proyecto: SOLID, KISS, YAGNI; un nivel de indentación por método; sin `else`; sin comentarios; nombres sin abreviar; `#` private fields donde aplique. ESLint y typecheck deben quedar verdes en cada commit.

## 9. Criterios de aceptación

1. `Middleware` interfaz exportada y auto-importable en `server/middleware/*.ts`.
2. `runMiddlewarePipeline(event, [], terminal)` ejecuta `terminal` y retorna su valor.
3. Per-handler middleware via `defineLaravelizedHandler({ middleware: [token] })` ejecuta en orden de declaración antes del controller.
4. Globales declarados con `container.instance(globalMiddlewareToken, [...])` ejecutan antes de per-handler.
5. Un middleware que no llama `next()` impide la ejecución del controller; su return es la respuesta.
6. Modificaciones post-`next()` (around) se preservan.
7. Suite verde: 53 prior + 6 unit MiddlewarePipeline + 4 unit defineLaravelizedHandler + 2 integration = 65 tests.

## 10. Dependencias

Ninguna nueva. Se reutilizan `@standard-schema/spec`, `h3`, `awilix` y las pieces de F0-A/B + F1.

## 11. Plan de implementación

F2-A se ejecuta como un único plan con tareas bite-sized:

1. `Middleware` interface + auto-import re-export.
2. `runMiddlewarePipeline` función pura + 6 tests TDD.
3. `globalMiddlewareToken` exportado.
4. Extensión de `defineLaravelizedHandler` (campo `middleware`) + integración con `runMiddlewarePipeline` + globales + 4 tests TDD nuevos.
5. Playground: middlewares + provider + endpoint protected.
6. Integration tests (2) + cierre.

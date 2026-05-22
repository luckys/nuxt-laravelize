# F2-D — HTTP Authorization (Design Spec)

**Estado:** propuesto
**Fecha:** 2026-05-22
**Depende de:** F0-A, F0-B, F1, F2-A
**Próximas fases sobre la misma capa:** F2-B (route binding), F2-C (resources)

## 1. Contexto y motivación

F1 dejó operativa la validación con `FormRequest`. F2-A añadió un pipeline Koa-style de middleware. Falta la pieza Laravel-style de **autorización**: una primitiva reutilizable (`Gate`) y un hook en `FormRequest` que decide si la request puede ejecutar el controller antes de que se valide el body.

F2-D añade exactamente eso. NO añade route binding, resources, policies clase, ni resolución implícita del user — esos van fuera del alcance.

## 2. Alcance

### Incluido en F2-D

- Nuevo bounded context `src/auth/`.
- Interfaz `Gate` + implementación default `InMemoryGate` con API funcional:
  - `define(rule, callback)`
  - `allows(rule, ...args): Promise<boolean>`
  - `denies(rule, ...args): Promise<boolean>`
- Error tipado `GateRuleNotDefinedError`.
- Token público `gateToken` para registrar el `Gate` en el container DI.
- Método opcional `authorize?(event): boolean | Promise<boolean>` en `FormRequest`.
- Integración en `defineLaravelizedHandler`: `authorize` ejecuta DESPUÉS del pipeline de middleware y ANTES de la validación.
- Respuesta 403 con shape `{ message: 'This action is unauthorized.' }` cuando `authorize` retorna `false`.

### Fuera de F2-D (fases posteriores)

- `Policy` clases estilo Laravel (`PostPolicy` con `view/update/delete/create`).
- Auto-resolución del user desde `event.context` (queda en manos del usuario).
- Helper global `authorize(rule, ...args)` como h3 utility.
- `before` hooks en Gate (superadmin bypass).
- Authorize declarativo en options: `defineLaravelizedHandler({ authorize: 'create-post' })`.
- Roles, scopes, permisos jerárquicos.

## 3. Decisiones de diseño

| Decisión | Elección | Razón |
|---|---|---|
| Alcance F2-D | Mínimo: hook `authorize()` + Gate funcional | YAGNI; cubre 80% del uso con superficie mínima |
| Firma del hook | `authorize(event): boolean | Promise<boolean>` | Simétrica con `body()/query()/params()`; sync o async |
| API del Gate | `define(rule, fn)` + `allows/denies` | Funcional, sin user implícito; el caller pasa todos los args |
| Bounded context | `src/auth/` separado de `src/http/` | Gate es agnóstico al transporte; podría reusarse fuera de HTTP |
| Registro del Gate | El usuario lo declara en un `ServiceProvider` con `container.singleton(gateToken, ...)` | Consistente con el resto del módulo; no hay magia |
| Resolución del Gate | El usuario hace `useContainer(event).make(gateToken)` dentro de `authorize()` | Sin acoplamiento entre FormRequest y Gate; testable |
| Orden de ejecución | middleware → `authorize` → `validateFormRequest` → controller | Laravel-style: si no autorizado, no se valida ni se exponen detalles del schema |
| Forma del 403 | `createError({ statusCode: 403, data: { message: 'This action is unauthorized.' } })` | Consistente con shape F1 (validation 422 `{ message, errors }`) |
| Rule no definida | `GateRuleNotDefinedError` propaga → 500 | Bug del usuario, falla rápido |
| `authorize()` lanza | Propaga sin captura | El usuario decide el statusCode si quiere uno custom |

## 4. Arquitectura

### 4.1 Estructura de `src/`

```
core/, discovery/, kit.ts          # F0 — sin cambios
module.ts                          # F0-B — sin cambios

auth/                              # F2-D nuevo bounded context
  Gate.ts                          # interface Gate + clase InMemoryGate
  GateRuleNotDefinedError.ts       # error tipado
  GateToken.ts                     # createToken<Gate>('laravelize.gate')
  index.ts                         # barrel

http/                              # F1 + F2-A + F2-D
  FormRequest.ts                   # MODIFICADO: + authorize?(event)
  ValidatedInput.ts                # F1 — sin cambios
  validateFormRequest.ts           # F1 — sin cambios
  Middleware.ts                    # F2-A
  MiddlewarePipeline.ts            # F2-A
  GlobalMiddleware.ts              # F2-A
  defineLaravelizedHandler.ts      # MODIFICADO: ejecuta authorize antes de validate
  index.ts                         # MODIFICADO: re-export auth/*
```

Sin cambios en `module.ts`, `kit.ts`, `discovery/`, `core/`, `runtime/plugin.ts`, `nitro/plugin.ts`. F2-D es 100% aditivo dentro de un nuevo bounded context + 2 ediciones quirúrgicas en `http/`.

### 4.2 Flujo de request

```
HTTP request
   │
   ▼
defineLaravelizedHandler (F1 + F2-A + F2-D)
   │
   ├─ useContainer(event)                           [F0]
   ├─ resolve middleware tokens                     [F2-A]
   ▼
runMiddlewarePipeline(event, middlewares, async () => {
   │
   ├─ request = options.request ? new options.request() : null
   │
   ├─ if (request?.authorize) {                     [F2-D]
   │     authorized = await request.authorize(event)
   │     if (!authorized) throw createError(403)
   │   }
   │
   ├─ input = request
   │           ? await validateFormRequest(event, request)   [F1]
   │           : { body: undefined, query: undefined, params: undefined }
   │
   ├─ controller = container.make(options.controller)
   └─ return await controller[options.method](input)
})
   │
   ▼
response
```

## 5. Componentes

### 5.1 `Gate` (interface + InMemoryGate)

```ts
export type GateCallback = (...args: readonly unknown[]) => boolean | Promise<boolean>

export interface Gate {
  define(rule: string, callback: GateCallback): void
  allows(rule: string, ...args: readonly unknown[]): Promise<boolean>
  denies(rule: string, ...args: readonly unknown[]): Promise<boolean>
}

export class InMemoryGate implements Gate {
  readonly #rules = new Map<string, GateCallback>()

  define(rule: string, callback: GateCallback): void {
    this.#rules.set(rule, callback)
  }

  async allows(rule: string, ...args: readonly unknown[]): Promise<boolean> {
    const callback = this.#rules.get(rule)
    if (!callback) throw new GateRuleNotDefinedError(rule)
    return await callback(...args)
  }

  async denies(rule: string, ...args: readonly unknown[]): Promise<boolean> {
    return !(await this.allows(rule, ...args))
  }
}
```

### 5.2 `GateRuleNotDefinedError`

```ts
export class GateRuleNotDefinedError extends Error {
  constructor(rule: string) {
    super(`Gate rule "${rule}" is not defined.`)
    this.name = 'GateRuleNotDefinedError'
  }
}
```

### 5.3 `gateToken`

```ts
import { createToken } from '../core/container/Token'
import type { Gate } from './Gate'

export const gateToken = createToken<Gate>('laravelize.gate')
```

### 5.4 `FormRequest` extendido

```ts
export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
  authorize?(event: H3Event): boolean | Promise<boolean>   // NEW
}
```

### 5.5 `defineLaravelizedHandler` extendido

Terminal del pipeline:

```ts
return await runMiddlewarePipeline(event, middlewares, async () => {
  const request = options.request ? new options.request() : null

  if (request?.authorize) {
    const authorized = await request.authorize(event)
    if (!authorized) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden',
        data: { message: 'This action is unauthorized.' },
      })
    }
  }

  const controller = container.make(options.controller)
  const input = request
    ? await validateFormRequest(event, request)
    : { body: undefined, query: undefined, params: undefined }

  const method = controller[options.method] as (input: unknown) => unknown
  return await method.call(controller, input)
})
```

## 6. Patrón de uso

```ts
// server/providers/GateProvider.ts
import { gateToken, InMemoryGate } from '@luckys_luis/nuxt-laravelize'

export default class GateProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(gateToken, () => {
      const gate = new InMemoryGate()
      gate.define('create-post', (user: User) => user.role === 'author')
      gate.define('update-post', (user: User, post: Post) => user.id === post.authorId)
      return gate
    })
  }
}

// server/http/CreatePostRequest.ts
class CreatePostRequest extends FormRequest {
  body() {
    return z.object({ title: z.string(), content: z.string() })
  }

  async authorize(event: H3Event): Promise<boolean> {
    const gate = useContainer(event).make(gateToken)
    const user = event.context.user as User | undefined
    if (!user) return false
    return await gate.allows('create-post', user)
  }
}

// server/api/posts.post.ts
export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'create',
  request: CreatePostRequest,
})
```

## 7. Manejo de errores

| Caso | Resultado |
|---|---|
| `authorize()` retorna `false` | `createError(403)` con `data: { message: 'This action is unauthorized.' }` |
| `authorize()` lanza | Propaga sin captura; h3 maneja |
| `gate.allows('x')` con rule no registrada | `GateRuleNotDefinedError` propaga → 500 |
| `gateToken` no registrado en container | `ServiceNotRegisteredError` (F0) propaga → 500 |
| `gate.define('x', fn)` dos veces | Sobrescribe (último gana, sin warning) |

## 8. Testing

### 8.1 Unitarios `test/auth/Gate.test.ts` (7 tests)

1. `define(rule, fn)` registra; `allows(rule, ...args)` invoca callback con args.
2. Callback sync retornando `true` → `allows` resuelve `true`.
3. Callback async retornando `Promise<true>` → `allows` resuelve `true`.
4. `denies` es negación de `allows`.
5. `allows` con rule no definida lanza `GateRuleNotDefinedError`.
6. `define` con misma rule sobrescribe (último gana).
7. Callback recibe args en el orden exacto en que se pasan.

### 8.2 Unitarios extendidos `test/http/defineLaravelizedHandler.test.ts` (3 tests nuevos)

8. `authorize()` retorna `false` → handler lanza `createError(403)`; controller NO se invoca.
9. `authorize()` retorna `true` → flujo continúa a validate + controller.
10. FormRequest sin `authorize()` → flujo F1 intacto (backward compatible).

### 8.3 Integración `test/integration/laravelize.test.ts` (2 tests nuevos)

11. `POST /api/posts` con header `x-user-role: author` → 200 + crea recurso.
12. `POST /api/posts` con header `x-user-role: guest` (o ausente) → 403 con `{ message: 'This action is unauthorized.' }`.

### 8.4 Playground setup

- `playground/server/providers/GateProvider.ts` — registra `gateToken` con `InMemoryGate` y define `create-post`.
- `playground/server/http/CreatePostRequest.ts` — FormRequest con `body()` (Zod) + `authorize(event)`.
- `playground/server/api/posts.post.ts` — endpoint con `defineLaravelizedHandler`.
- `playground/server/middleware/inject-user.ts` — Nitro middleware nativo que setea `event.context.user` desde header `x-user-role`. **Nota:** este es Nitro auto-scan (`server/middleware/`), no un `Middleware` de F2-A.

### 8.5 Metodología

TDD estricto: test → fail → implementar → pass → commit.

## 9. Convenciones de código

Reglas del proyecto: SOLID, KISS, YAGNI; un nivel de indentación por método; sin `else`; sin comentarios; nombres sin abreviar; `#` private fields; sin punto y coma; comillas simples; trailing commas. ESLint y typecheck deben quedar verdes en cada commit.

## 10. Criterios de aceptación

1. `Gate` interface + `InMemoryGate` + `GateRuleNotDefinedError` + `gateToken` exportados desde `@luckys_luis/nuxt-laravelize`.
2. `gate.define(rule, fn)` + `gate.allows(rule, ...args)` + `gate.denies(rule, ...args)` operativos sync y async.
3. `gateToken` registrable en `Container` desde un `ServiceProvider`.
4. `FormRequest.authorize?(event)` opcional; ausencia → comportamiento F1 intacto.
5. `authorize()` ejecuta DESPUÉS del pipeline de middleware (F2-A) y ANTES de `validateFormRequest` (F1).
6. `authorize()` retornando `false` → 403 con shape `{ message: 'This action is unauthorized.' }`; controller NO ejecuta.
7. `authorize()` retornando `true` → flujo continúa normal.
8. Suite verde: 65 prior (post-F2-A) + 7 unit Gate + 3 unit defineLaravelizedHandler + 2 integration = **77 tests**.

## 11. Dependencias

Ninguna nueva. Reutiliza `h3` (createError), `core/container/*` (F0-A), `http/*` (F1 + F2-A), `runtime/server/useContainer` (F0-B).

## 12. Plan de implementación

F2-D se ejecuta como un único plan con tareas bite-sized:

1. `src/auth/Gate.ts` con `Gate` interface + `InMemoryGate` + `GateCallback` + `GateRuleNotDefinedError` + 7 tests TDD.
2. `src/auth/GateToken.ts` + `src/auth/index.ts` (barrel).
3. `src/http/FormRequest.ts` añadir firma `authorize?(event)` (cambio mínimo).
4. `src/http/defineLaravelizedHandler.ts` integrar `authorize` antes de `validateFormRequest` + 3 tests TDD.
5. `src/http/index.ts` re-export auth + verificar `src/index.ts` raíz expone tokens públicos.
6. Playground: `GateProvider`, `CreatePostRequest`, endpoint `posts.post.ts`, Nitro middleware `inject-user.ts`.
7. Integration tests (2) + cierre.

# F1 — HTTP: Controllers + Validation (Design Spec)

**Estado:** propuesto
**Depende de:** F0-A (núcleo del contenedor) + F0-B (integración Nuxt)
**Próximas fases sobre la misma capa:** middleware, route binding, resources/transformers, authorization (F2/F4)

## 1. Contexto y motivación

F0 dejó operativo el contenedor IoC, los `ServiceProvider`s y la integración con Nuxt (plugin Nitro con scope por request, plugin cliente, composables). El siguiente paso natural para una experiencia "Laravel-like" es la capa HTTP: clases controller que encapsulan handlers + una forma declarativa de validar la entrada (`FormRequest`).

Nitro ya provee file-based routing por convención (`server/api/*.ts`, `server/routes/**.ts`) y h3 expone `defineEventHandler`. F1 NO reemplaza ese routing: añade un *adapter* que conecta cada archivo de ruta con un controller resuelto desde el contenedor + opcionalmente una validación declarativa del input.

## 2. Alcance

### Incluido en F1

- Clase abstracta `FormRequest` con métodos opcionales `body()`, `query()`, `params()` que devuelven schemas Standard Schema-compatibles.
- Tipo `ValidatedInput<TRequest>` que infiere `{ body, query, params }` desde una sub-clase concreta.
- Función `defineLaravelizedHandler({ controller, method, request? })` que retorna un `EventHandler` h3 listo para usar en `server/api/*.ts`.
- Helper interno `validateFormRequest(event, request)` con la lógica de validación pura y testable.
- Respuestas de error 422 con shape Laravel-compatible: `{ message, errors: { 'body.field': [...] } }`.
- Auto-imports en server (`addServerImportsDir`) para `defineLaravelizedHandler` y `FormRequest`.
- Tests unitarios con Zod **y** Valibot como fixtures (demuestra agnosticismo) + tests de integración con `@nuxt/test-utils`.

### Fuera de F1 (fases posteriores)

- Middleware (Laravel pipe vs h3 interceptor)
- Route binding (`/users/:id` → `User` resuelto)
- API resources / transformers (formateo de output)
- Authorization (`authorize()` hook en FormRequest, gates/policies)
- `prepareForValidation()` y otros hooks de Laravel
- Customización del response formatter (422 shape inyectable)
- Errores tipados específicos del módulo (`ValidationError` class) — F1 usa `createError` de h3 directamente
- Soporte client-side (los controllers son server-only en F1)

## 3. Decisiones de diseño

| Decisión | Elección | Razón |
|---|---|---|
| Modelo controllers | Adapter sobre file-based routing | Preserva el idiom Nitro; controllers testables sin HTTP |
| Validation library | Agnóstica (Standard Schema) | No fuerza Zod ni Valibot; el consumidor elige |
| Composición de FormRequest | Métodos separados `body/query/params` | Tipado granular; cada parte HTTP se valida explícitamente |
| Resolución de controller | Token DI registrado por el usuario | Consistente con F0; sin "magic" de descubrimiento |
| Signature del método controller | `({ body, query, params }: ValidatedInput<T>)` | Testable sin mocks de HTTP; tipado fuerte por inferencia |
| Error de validación | 422 + JSON Laravel-style fijo | Convención sólida y predecible; customización en F2 |
| Auto-imports server | `defineLaravelizedHandler`, `FormRequest` | Idiom Nuxt; menos imports verbose en `server/api/*.ts` |

## 4. Arquitectura

### 4.1 Estructura de `src/`

```
core/                         # F0-A — sin cambios
  container/...
  providers/...

discovery/, kit.ts, module.ts # F0-B — sin cambios significativos*

http/                         # F1 — nuevo bounded context
  FormRequest.ts              # abstract class
  ValidatedInput.ts           # type helper (zero-runtime)
  validateFormRequest.ts      # función pura testable
  defineLaravelizedHandler.ts # adapter (EventHandler factory)
  index.ts                    # barrel para re-exports

runtime/server/http/          # F1 — auto-import target
  index.ts                    # re-exporta defineLaravelizedHandler y FormRequest desde src/http
```

*`module.ts` se modifica para añadir `addServerImportsDir(./runtime/server/http)` adicional.

### 4.2 Dependencia explícita: `@standard-schema/spec`

El módulo gana una dependencia ligera nueva: `@standard-schema/spec` (~zero runtime, solo tipos). Esto formaliza la API agnóstica. El consumidor instala su librería preferida (Zod ≥3.24, Valibot ≥0.31, etc.) que ya implementa Standard Schema.

### 4.3 Flujo de request

```
HTTP POST /api/users
   │
   ▼
server/api/users.post.ts → defineLaravelizedHandler({...})
   │
   ▼
adapter (EventHandler)
   ├─ useContainer(event)                         [F0]
   ├─ container.make(controllerToken)             [F0]
   ├─ (si options.request)
   │     ├─ const fr = new options.request()
   │     └─ validateFormRequest(event, fr)
   │           ├─ readBody(event)  → fr.body()
   │           ├─ getQuery(event)  → fr.query()
   │           ├─ event.context.params → fr.params()
   │           └─ on issues: throw createError(422, errors)
   ▼
controller[method]({ body, query, params })
   ▼
response (cualquier valor JSON-serializable)
```

## 5. Componentes

### 5.1 `FormRequest` (abstract)

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
}
```

Métodos opcionales. La sub-clase implementa solo los que necesita.

### 5.2 `ValidatedInput<TRequest>` (type helper)

Infiere el shape exacto del input validado desde una sub-clase concreta. Una sección no declarada se infiere como `undefined`.

```ts
type SchemaFor<TRequest, K extends 'body' | 'query' | 'params'>
  = TRequest extends Record<K, () => infer S>
    ? S extends StandardSchemaV1
      ? StandardSchemaV1.InferOutput<S>
      : undefined
    : undefined

export type ValidatedInput<TRequest extends FormRequest> = {
  body: SchemaFor<TRequest, 'body'>
  query: SchemaFor<TRequest, 'query'>
  params: SchemaFor<TRequest, 'params'>
}
```

### 5.3 `validateFormRequest(event, request)` (helper testable)

Función pura que orquesta la validación de las tres secciones. Recibe un `H3Event` y un `FormRequest` instanciado. Retorna el input validado o lanza un `createError(422, ...)`.

Responsabilidades:
- Para cada sección con método definido: lee la entrada cruda con la utilidad h3 correspondiente, llama `schema['~standard'].validate(rawInput)`, recoge issues con prefijo de sección.
- Si hay issues en cualquier sección: lanza el error 422 agregado.
- Si no hay issues: retorna el objeto `{ body, query, params }` con valores parseados (o `undefined` para secciones omitidas).

### 5.4 `defineLaravelizedHandler` (adapter)

```ts
interface LaravelizedHandlerOptions<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
> {
  controller: Token<TController>
  method: TMethod
  request?: new () => TRequest
}

export function defineLaravelizedHandler<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
>(options: LaravelizedHandlerOptions<TController, TMethod, TRequest>): EventHandler
```

Internamente:
1. Devuelve `defineEventHandler(async (event) => { ... })`.
2. Obtiene el container scoped del event: `useContainer(event)`.
3. Resuelve el controller: `container.make(options.controller)`.
4. Si `options.request` está, ejecuta `validateFormRequest(event, new options.request())` y captura el resultado.
5. Llama `(controller[options.method] as Function).call(controller, input)` con el `input` validado (o `{ body: undefined, query: undefined, params: undefined }` si no hay request).
6. Retorna el resultado (el pipeline de h3 lo serializa a JSON).

El tipo de retorno del adapter es `EventHandler<Request, Response>`; el `Response` se infiere del método del controller cuando TypeScript pueda hacerlo.

### 5.5 Shape del error 422

```ts
throw createError({
  statusCode: 422,
  statusMessage: 'Unprocessable Entity',
  data: {
    message: 'Validation failed',
    errors: {
      'body.email': ['Invalid email'],
      'body.name': ['Required'],
      'query.page': ['Must be a positive integer'],
    },
  },
})
```

El path se construye uniendo la sección (`body`, `query`, `params`) con los segmentos de `issue.path` separados por puntos. Cada path acumula todos los mensajes de issues que apuntan a esa ruta.

## 6. Manejo de errores

| Origen | Resultado |
|---|---|
| Validación falla | `createError({ statusCode: 422, data: { message, errors } })` |
| Controller token no registrado | `ServiceNotRegisteredError` (F0) propaga, h3 responde 500 con el mensaje |
| Método del controller lanza | Propaga sin captura; h3 maneja la respuesta de error |
| `options.request` no extiende `FormRequest` en runtime | Comportamiento indefinido (los tipos lo previenen en compile-time) |

## 7. Testing

### 7.1 Unitarios (`test/http/`, sin Nuxt, Vitest)

- `validateFormRequest.test.ts` — función pura, mock minimal de `H3Event`:
  - Solo body, schema Zod, válido → input correcto, `query`/`params` `undefined`.
  - Solo query, schema Valibot, válido → input correcto (prueba el agnosticismo).
  - Solo params, schema Zod, válido.
  - Body + query + params los tres definidos y válidos.
  - Body inválido (campo faltante) → 422 con `errors['body.field']`.
  - Body y query ambos inválidos → ambos paths en `errors`.
  - Sin ningún método definido → `{ body: undefined, query: undefined, params: undefined }`, sin llamadas a `readBody/getQuery`.
- `defineLaravelizedHandler.test.ts` — mock container + mock event:
  - Llama `container.make(token)` con el token correcto.
  - Llama el método del controller con el input validado.
  - Sin `request`, llama con `{ body: undefined, query: undefined, params: undefined }`.
  - Si `validateFormRequest` lanza, el adapter propaga el error sin tocar el controller.

### 7.2 Integración (`test/integration/`, `@nuxt/test-utils/e2e`)

Extender el playground con:
- `playground/server/controllers/UserController.ts` — clase con `index()` y `store({ body })`.
- `playground/server/providers/UserControllerProvider.ts` — registra `userControllerToken` como `scoped`.
- `playground/server/requests/CreateUserRequest.ts` — extiende `FormRequest`, implementa `body()` con Zod.
- `playground/server/api/users.post.ts` — `export default defineLaravelizedHandler({...})`.

Tests:
- POST con body válido → 200 + payload con el user creado.
- POST con body inválido (email malformado) → 422 + `{ message, errors: { 'body.email': [...] } }`.

### 7.3 Metodología

TDD estricto: tests primero, ven fallar, implementan, ven pasar, commit.

## 8. Convenciones de código

El código sigue las reglas del proyecto: SOLID, KISS, YAGNI, Object Calisthenics; un nivel de indentación por método; sin `else`; sin comentarios; nombres sin abreviar; clases pequeñas con responsabilidad única.

`#` private fields preferidos donde aplique. No exportar tipos internos (`SchemaFor` se mantiene privado al módulo `ValidatedInput.ts`).

## 9. Criterios de aceptación

1. `defineLaravelizedHandler` resuelve el controller vía `useContainer(event)` + `container.make(token)` (F0).
2. `FormRequest.body/query/params` se validan en orden y de forma independiente: cada parte opcional.
3. Validación inválida → 422 con `{ message, errors }` Laravel-style. Validación exitosa → status 200 (o el que retorne el método del controller con `setResponseStatus`).
4. `ValidatedInput<TRequest>` infiere `{ body, query, params }` con los tipos de los schemas; `undefined` para secciones omitidas.
5. Cualquier schema compatible con Standard Schema funciona; probado con Zod **y** Valibot.
6. `defineLaravelizedHandler` y `FormRequest` quedan auto-importados en `server/api/*.ts` y `server/requests/*.ts` sin import explícito.
7. Suite de tests unitarios + integración pasa.

## 10. Dependencias

- Producción: `@standard-schema/spec` (nueva, solo tipos).
- Dev: `zod` y `valibot` como fixtures en tests (no exportados por el módulo).

## 11. Plan de implementación

F1 se ejecuta como un único plan (no se divide en sub-fases). Los tasks bite-sized cubren:

1. Añadir `@standard-schema/spec` a dependencies + `zod`/`valibot` a devDependencies.
2. `FormRequest` + tipo `ValidatedInput<T>` (sin runtime real; tests de tipos por casos concretos).
3. `validateFormRequest` con tests unitarios (body/query/params, ok/fail, mezcla Zod+Valibot).
4. `defineLaravelizedHandler` con tests unitarios (mock container + mock event).
5. Wiring en `module.ts`: `addServerImportsDir(./runtime/server/http)` + `runtime/server/http/index.ts` re-export.
6. Playground: controller + provider + request + endpoint POST.
7. Integration tests + cierre.

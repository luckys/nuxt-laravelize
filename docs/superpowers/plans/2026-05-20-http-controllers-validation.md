# F1 Implementation Plan — HTTP: Controllers + Validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una capa HTTP delgada sobre F0: clases controller resueltas del container DI más `FormRequest` con validación declarativa agnóstica (Standard Schema), expuestas vía un `defineLaravelizedHandler` que envuelve `defineEventHandler` de h3.

**Architecture:** Nuevo bounded context `src/http/` con cuatro piezas: `FormRequest` (abstract class con métodos opcionales `body()/query()/params()`), tipo `ValidatedInput<T>` (zero-runtime, infiere shape desde la sub-clase), `validateFormRequest` (función que valida un FormRequest contra un `H3Event`), y `defineLaravelizedHandler` (adapter que compone DI + validación + invocación del método). Auto-import vía `addServerImportsDir` en `module.ts`.

**Tech Stack:** `@standard-schema/spec` (solo tipos, agnóstico de librería), Zod + Valibot como fixtures de test, `h3` (`defineEventHandler`, `readBody`, `getQuery`, `createError`), F0 (`useContainer`, `Token`, `Container`).

---

## Pre-condiciones

F0-A + F0-B en `main`, 37 tests verdes. Ejecuta `pnpm dev:prepare` si `.nuxt/` no existe.

---

## Task 1: Añadir dependencias

`@standard-schema/spec` como dependency (paquete público de tipos, ~0 runtime). `zod` y `valibot` como devDependencies para fixtures de test (no se re-exportan).

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add @standard-schema/spec
pnpm add -D zod valibot
```

- [ ] **Step 2: Verificar el resultado**

Comprueba que `package.json` tenga:
- `dependencies.@standard-schema/spec` ≥ 1.0.0
- `devDependencies.zod` ≥ 3.24.0
- `devDependencies.valibot` ≥ 0.42.0

Si las versiones no son compatibles con Standard Schema (Zod < 3.24 no implementa `~standard`), forza versiones explícitas: `pnpm add @standard-schema/spec@^1 && pnpm add -D zod@^3.24 valibot@^0.42`.

- [ ] **Step 3: Verificar suite existente sigue verde**

Run: `pnpm dev:prepare && pnpm exec vitest run && pnpm lint && pnpm typecheck`
Expected: 37 tests pass, lint/typecheck clean.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add standard-schema and validation libs for F1"
```

---

## Task 2: `FormRequest` y `ValidatedInput<T>`

Dos archivos pequeños. `FormRequest` es la clase abstracta. `ValidatedInput<T>` es un tipo puro (sin runtime) que infiere el shape del input validado desde una sub-clase concreta.

**Files:**
- Create: `src/http/FormRequest.ts`
- Create: `src/http/ValidatedInput.ts`
- Create: `test/http/FormRequest.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `test/http/FormRequest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FormRequest } from '../../src/http/FormRequest'

describe('FormRequest', () => {
  it('lets a subclass declare only body', () => {
    class CreateUserRequest extends FormRequest {
      body() {
        return z.object({ email: z.string().email() })
      }
    }

    const request = new CreateUserRequest()

    expect(request.body).toBeDefined()
    expect(request.query).toBeUndefined()
    expect(request.params).toBeUndefined()
  })

  it('lets a subclass declare only query', () => {
    class ListUsersRequest extends FormRequest {
      query() {
        return z.object({ page: z.number().int().positive() })
      }
    }

    const request = new ListUsersRequest()

    expect(request.body).toBeUndefined()
    expect(request.query).toBeDefined()
    expect(request.params).toBeUndefined()
  })

  it('lets a subclass declare body and params together', () => {
    class UpdateUserRequest extends FormRequest {
      body() {
        return z.object({ name: z.string() })
      }

      params() {
        return z.object({ id: z.string().uuid() })
      }
    }

    const request = new UpdateUserRequest()

    expect(request.body).toBeDefined()
    expect(request.params).toBeDefined()
    expect(request.query).toBeUndefined()
  })

  it('allows a subclass to declare no schemas at all', () => {
    class HealthcheckRequest extends FormRequest {}

    const request = new HealthcheckRequest()

    expect(request.body).toBeUndefined()
    expect(request.query).toBeUndefined()
    expect(request.params).toBeUndefined()
  })
})
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm exec vitest run test/http/FormRequest.test.ts`
Expected: FAIL — `Cannot find module '../../src/http/FormRequest'`.

- [ ] **Step 3: Implementar `FormRequest`**

Crea `src/http/FormRequest.ts`:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
}
```

- [ ] **Step 4: Confirmar que el test pasa**

Run: `pnpm exec vitest run test/http/FormRequest.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Implementar `ValidatedInput<T>`**

Crea `src/http/ValidatedInput.ts`:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

import type { FormRequest } from './FormRequest'

type SchemaFor<TRequest, TKey extends 'body' | 'query' | 'params'>
  = TRequest extends Record<TKey, () => infer TSchema>
    ? TSchema extends StandardSchemaV1
      ? StandardSchemaV1.InferOutput<TSchema>
      : undefined
    : undefined

export type ValidatedInput<TRequest extends FormRequest> = {
  body: SchemaFor<TRequest, 'body'>
  query: SchemaFor<TRequest, 'query'>
  params: SchemaFor<TRequest, 'params'>
}
```

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos limpios.

- [ ] **Step 7: Commit**

```bash
git add src/http/FormRequest.ts src/http/ValidatedInput.ts test/http/FormRequest.test.ts
git commit -m "feat: add FormRequest abstract class and ValidatedInput type helper"
```

---

## Task 3: `validateFormRequest`

Función que aplica los schemas declarados en un `FormRequest` contra un `H3Event`. Retorna el input validado o lanza `createError(422)`. Se testea unitariamente mockeando las utilidades de `h3` (`readBody`, `getQuery`) con `vi.mock`.

**Files:**
- Create: `src/http/validateFormRequest.ts`
- Create: `test/http/validateFormRequest.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `test/http/validateFormRequest.test.ts`:

```ts
import type { H3Event } from 'h3'
import * as v from 'valibot'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(),
    getQuery: vi.fn(),
  }
})

import * as h3 from 'h3'

import { FormRequest } from '../../src/http/FormRequest'
import { validateFormRequest } from '../../src/http/validateFormRequest'

function createMockEvent(params: Record<string, string> = {}): H3Event {
  return { context: { params } } as unknown as H3Event
}

describe('validateFormRequest', () => {
  beforeEach(() => {
    vi.mocked(h3.readBody).mockReset()
    vi.mocked(h3.getQuery).mockReset()
  })

  it('returns undefined for sections when the request declares no schemas', async () => {
    class EmptyRequest extends FormRequest {}

    const event = createMockEvent()
    const result = await validateFormRequest(event, new EmptyRequest())

    expect(result).toEqual({ body: undefined, query: undefined, params: undefined })
    expect(h3.readBody).not.toHaveBeenCalled()
    expect(h3.getQuery).not.toHaveBeenCalled()
  })

  it('validates body with a Zod schema and returns the parsed value', async () => {
    class CreateUserRequest extends FormRequest {
      body() {
        return z.object({ email: z.string().email() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ email: 'user@example.com' })

    const result = await validateFormRequest(createMockEvent(), new CreateUserRequest())

    expect(result.body).toEqual({ email: 'user@example.com' })
    expect(result.query).toBeUndefined()
    expect(result.params).toBeUndefined()
  })

  it('validates query with a Valibot schema (agnostic across libraries)', async () => {
    class ListUsersRequest extends FormRequest {
      query() {
        return v.object({ page: v.number() })
      }
    }

    vi.mocked(h3.getQuery).mockReturnValue({ page: 1 })

    const result = await validateFormRequest(createMockEvent(), new ListUsersRequest())

    expect(result.query).toEqual({ page: 1 })
  })

  it('validates params from event.context.params', async () => {
    class ShowUserRequest extends FormRequest {
      params() {
        return z.object({ id: z.string() })
      }
    }

    const event = createMockEvent({ id: 'abc-123' })
    const result = await validateFormRequest(event, new ShowUserRequest())

    expect(result.params).toEqual({ id: 'abc-123' })
  })

  it('validates body, query, and params together when all three are declared', async () => {
    class UpdateUserRequest extends FormRequest {
      body() {
        return z.object({ name: z.string() })
      }

      query() {
        return z.object({ notify: z.literal('yes').or(z.literal('no')) })
      }

      params() {
        return z.object({ id: z.string() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ name: 'Ada' })
    vi.mocked(h3.getQuery).mockReturnValue({ notify: 'yes' })

    const event = createMockEvent({ id: 'u-1' })
    const result = await validateFormRequest(event, new UpdateUserRequest())

    expect(result).toEqual({
      body: { name: 'Ada' },
      query: { notify: 'yes' },
      params: { id: 'u-1' },
    })
  })

  it('throws a 422 createError with a Laravel-style errors object when body is invalid', async () => {
    class CreateUserRequest extends FormRequest {
      body() {
        return z.object({ email: z.string().email() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ email: 'not-an-email' })

    let caught: unknown
    try {
      await validateFormRequest(createMockEvent(), new CreateUserRequest())
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeDefined()
    const error = caught as { statusCode: number, data: { message: string, errors: Record<string, string[]> } }
    expect(error.statusCode).toBe(422)
    expect(error.data.message).toBe('Validation failed')
    expect(Object.keys(error.data.errors)).toContain('body.email')
    expect(error.data.errors['body.email']?.length).toBeGreaterThan(0)
  })

  it('aggregates errors from multiple sections into a single response', async () => {
    class UpdateUserRequest extends FormRequest {
      body() {
        return z.object({ name: z.string().min(1) })
      }

      query() {
        return z.object({ page: z.number() })
      }
    }

    vi.mocked(h3.readBody).mockResolvedValue({ name: '' })
    vi.mocked(h3.getQuery).mockReturnValue({ page: 'not-a-number' })

    let caught: unknown
    try {
      await validateFormRequest(createMockEvent(), new UpdateUserRequest())
    }
    catch (error) {
      caught = error
    }

    const error = caught as { data: { errors: Record<string, string[]> } }
    expect(Object.keys(error.data.errors).sort()).toEqual(['body.name', 'query.page'])
  })
})
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm exec vitest run test/http/validateFormRequest.test.ts`
Expected: FAIL — `Cannot find module '../../src/http/validateFormRequest'`.

- [ ] **Step 3: Implementar `validateFormRequest`**

Crea `src/http/validateFormRequest.ts`:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'
import { createError, getQuery, readBody } from 'h3'

import type { FormRequest } from './FormRequest'

type Section = 'body' | 'query' | 'params'

type ValidationErrors = Record<string, string[]>

interface ValidationResult {
  body: unknown
  query: unknown
  params: unknown
}

export async function validateFormRequest(event: H3Event, request: FormRequest): Promise<ValidationResult> {
  const errors: ValidationErrors = {}
  const result: ValidationResult = { body: undefined, query: undefined, params: undefined }

  if (request.body) {
    const data = await readBody(event)
    result.body = await validateSection(request.body(), data, errors, 'body')
  }

  if (request.query) {
    const data = getQuery(event)
    result.query = await validateSection(request.query(), data, errors, 'query')
  }

  if (request.params) {
    const data = event.context.params ?? {}
    result.params = await validateSection(request.params(), data, errors, 'params')
  }

  if (Object.keys(errors).length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      data: { message: 'Validation failed', errors },
    })
  }

  return result
}

async function validateSection(
  schema: StandardSchemaV1,
  data: unknown,
  errors: ValidationErrors,
  section: Section,
): Promise<unknown> {
  const validation = await schema['~standard'].validate(data)
  if (validation.issues) {
    collectIssues(errors, section, validation.issues)
    return undefined
  }

  return validation.value
}

function collectIssues(errors: ValidationErrors, section: Section, issues: ReadonlyArray<StandardSchemaV1.Issue>): void {
  for (const issue of issues) {
    const path = buildPath(section, issue.path)
    const list = errors[path] ?? []
    list.push(issue.message)
    errors[path] = list
  }
}

function buildPath(section: Section, issuePath: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined): string {
  if (!issuePath || issuePath.length === 0) {
    return section
  }

  const segments = issuePath.map(segment => (typeof segment === 'object' ? String(segment.key) : String(segment)))
  return [section, ...segments].join('.')
}
```

- [ ] **Step 4: Confirmar que los tests pasan**

Run: `pnpm exec vitest run test/http/validateFormRequest.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos limpios.

- [ ] **Step 6: Commit**

```bash
git add src/http/validateFormRequest.ts test/http/validateFormRequest.test.ts
git commit -m "feat: add validateFormRequest with Standard Schema support"
```

---

## Task 4: `defineLaravelizedHandler`

Adapter que envuelve `defineEventHandler` de h3. Resuelve el controller del container DI (F0), opcionalmente valida el FormRequest, llama el método del controller con el input y devuelve el resultado.

**Files:**
- Create: `src/http/defineLaravelizedHandler.ts`
- Create: `test/http/defineLaravelizedHandler.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `test/http/defineLaravelizedHandler.test.ts`:

```ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(),
    getQuery: vi.fn(),
  }
})

vi.mock('../../src/runtime/server/utils/useContainer', () => ({
  useContainer: vi.fn(),
}))

import * as h3 from 'h3'

import type { Container } from '../../src/core/container/Container'
import { createToken } from '../../src/core/container/Token'
import { FormRequest } from '../../src/http/FormRequest'
import { defineLaravelizedHandler } from '../../src/http/defineLaravelizedHandler'
import { useContainer } from '../../src/runtime/server/utils/useContainer'

interface UsersController {
  store(input: { body: { email: string }, query: undefined, params: undefined }): Promise<{ id: string }>
  index(input: { body: undefined, query: undefined, params: undefined }): Promise<Array<{ id: string }>>
}

const usersControllerToken = createToken<UsersController>('users-controller')

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

function createMockContainer(instance: unknown): Container {
  return { make: vi.fn().mockReturnValue(instance) } as unknown as Container
}

describe('defineLaravelizedHandler', () => {
  it('resolves the controller from the container and calls the method with the validated input', async () => {
    class CreateUserRequest extends FormRequest {
      body() {
        return z.object({ email: z.string().email() })
      }
    }

    const controller: UsersController = {
      store: vi.fn().mockResolvedValue({ id: 'user-1' }),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))
    vi.mocked(h3.readBody).mockResolvedValue({ email: 'user@example.com' })

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreateUserRequest,
    })

    const event = createMockEvent()
    const response = await handler(event)

    expect(response).toEqual({ id: 'user-1' })
    expect(controller.store).toHaveBeenCalledWith({
      body: { email: 'user@example.com' },
      query: undefined,
      params: undefined,
    })
  })

  it('calls the method with all-undefined input when no request is configured', async () => {
    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual([{ id: 'user-1' }])
    expect(controller.index).toHaveBeenCalledWith({ body: undefined, query: undefined, params: undefined })
  })

  it('does not call the controller method when validation fails', async () => {
    class CreateUserRequest extends FormRequest {
      body() {
        return z.object({ email: z.string().email() })
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))
    vi.mocked(h3.readBody).mockResolvedValue({ email: 'not-an-email' })

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreateUserRequest,
    })

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 422,
    })

    expect(controller.store).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: FAIL — `Cannot find module '../../src/http/defineLaravelizedHandler'`.

- [ ] **Step 3: Implementar `defineLaravelizedHandler`**

Crea `src/http/defineLaravelizedHandler.ts`:

```ts
import { defineEventHandler, type EventHandler } from 'h3'

import type { Token } from '../core/container/Token'
import { useContainer } from '../runtime/server/utils/useContainer'

import type { FormRequest } from './FormRequest'
import { validateFormRequest } from './validateFormRequest'

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
>(options: LaravelizedHandlerOptions<TController, TMethod, TRequest>): EventHandler {
  return defineEventHandler(async (event) => {
    const container = useContainer(event)
    const controller = container.make(options.controller)
    const input = options.request
      ? await validateFormRequest(event, new options.request())
      : { body: undefined, query: undefined, params: undefined }
    const method = controller[options.method] as (input: unknown) => unknown
    return await method.call(controller, input)
  })
}
```

- [ ] **Step 4: Confirmar que los tests pasan**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos limpios. Si lint quejea por el cast `as (input: unknown) => unknown`, está justificado: el tipo `TController[TMethod]` es `unknown` para el adapter; el contrato es responsabilidad del usuario que tipa su clase controller.

- [ ] **Step 6: Commit**

```bash
git add src/http/defineLaravelizedHandler.ts test/http/defineLaravelizedHandler.test.ts
git commit -m "feat: add defineLaravelizedHandler adapter"
```

---

## Task 5: Wiring — barrel, runtime/server/http, module.ts

Expone los símbolos públicos para auto-import en `server/api/*.ts` y `server/requests/*.ts` del consumidor. Crea un barrel + un re-export en `runtime/server/http/index.ts` que `addServerImportsDir` escanea.

**Files:**
- Create: `src/http/index.ts`
- Create: `src/runtime/server/http/index.ts`
- Modify: `src/module.ts`

- [ ] **Step 1: Crear el barrel de `src/http/`**

Crea `src/http/index.ts`:

```ts
export { FormRequest } from './FormRequest'
export type { ValidatedInput } from './ValidatedInput'
export { defineLaravelizedHandler } from './defineLaravelizedHandler'
export { validateFormRequest } from './validateFormRequest'
```

- [ ] **Step 2: Crear el re-export para auto-import en server**

Crea `src/runtime/server/http/index.ts`:

```ts
export { FormRequest } from '../../../http/FormRequest'
export { defineLaravelizedHandler } from '../../../http/defineLaravelizedHandler'
```

`ValidatedInput` es type-only — se importa explícitamente, no se auto-importa.

- [ ] **Step 3: Modificar `src/module.ts` para añadir el `addServerImportsDir`**

Localiza la línea con `addServerImportsDir(resolver.resolve('./runtime/server/utils'))` y añade DEBAJO:

```ts
    addServerImportsDir(resolver.resolve('./runtime/server/http'))
```

El bloque final de `setup()` debe quedar:

```ts
    addPlugin(resolver.resolve('./runtime/plugin'))
    addServerPlugin(resolver.resolve('./nitro/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerImportsDir(resolver.resolve('./runtime/server/http'))
```

- [ ] **Step 4: Verificar typecheck + lint + tests + build**

Run: `pnpm dev:prepare && pnpm typecheck && pnpm lint && pnpm exec vitest run && pnpm prepack`
Expected: dev:prepare OK, typecheck limpio, lint limpio, 51 tests verdes (37 prior + 4 FormRequest + 7 validate + 3 handler), prepack OK.

- [ ] **Step 5: Commit**

```bash
git add src/http/index.ts src/runtime/server/http/index.ts src/module.ts
git commit -m "feat: wire http barrel and server auto-imports"
```

---

## Task 6: Playground — controller + provider + request + endpoint

Demuestra el uso real: un `UserController` registrado como `scoped`, una `CreateUserRequest` con Zod, y un endpoint POST que conecta ambos vía `defineLaravelizedHandler`.

**Files:**
- Create: `playground/server/controllers/UserController.ts`
- Create: `playground/server/controllers/userTokens.ts`
- Create: `playground/server/providers/UserControllerProvider.ts`
- Create: `playground/server/requests/CreateUserRequest.ts`
- Create: `playground/server/api/users.post.ts`

- [ ] **Step 1: Crear el token del controller**

Crea `playground/server/controllers/userTokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'

export interface UsersControllerContract {
  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string }
}

export const userControllerToken = createToken<UsersControllerContract>('playground.user-controller')
```

- [ ] **Step 2: Crear el controller**

Crea `playground/server/controllers/UserController.ts`:

```ts
import type { UsersControllerContract } from './userTokens'

export class UserController implements UsersControllerContract {
  #nextId = 1

  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string } {
    const id = `user-${this.#nextId}`
    this.#nextId += 1
    return { id, email: input.body.email, name: input.body.name }
  }
}
```

- [ ] **Step 3: Crear el provider que registra el controller en el container**

Crea `playground/server/providers/UserControllerProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { UserController } from '../controllers/UserController'
import { userControllerToken } from '../controllers/userTokens'

export default class UserControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(userControllerToken, () => new UserController())
  }
}
```

- [ ] **Step 4: Crear el FormRequest**

Crea `playground/server/requests/CreateUserRequest.ts`:

```ts
import { z } from 'zod'

import { FormRequest } from '../../../src/http/FormRequest'

export class CreateUserRequest extends FormRequest {
  body() {
    return z.object({
      email: z.string().email(),
      name: z.string().min(1),
    })
  }
}
```

- [ ] **Step 5: Crear el endpoint POST**

Crea `playground/server/api/users.post.ts`:

```ts
import { userControllerToken } from '../controllers/userTokens'
import { CreateUserRequest } from '../requests/CreateUserRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'store',
  request: CreateUserRequest,
})
```

`defineLaravelizedHandler` viene del auto-import del módulo.

- [ ] **Step 6: Verificar suite y build**

Run: `pnpm dev:prepare && pnpm typecheck && pnpm lint && pnpm exec vitest run && pnpm prepack`
Expected: typecheck limpio, lint limpio, 51 tests verdes (sin tests nuevos todavía), prepack OK.

- [ ] **Step 7: Commit**

```bash
git add playground/server/controllers/ playground/server/providers/UserControllerProvider.ts playground/server/requests/ playground/server/api/users.post.ts
git commit -m "feat(playground): demonstrate controller + FormRequest wiring"
```

---

## Task 7: Test de integración + cierre

Extiende el test de integración existente con dos casos adicionales: POST `/api/users` con body válido y con body inválido. Demuestra el flujo end-to-end: validación → DI → método del controller → respuesta.

**Files:**
- Modify: `test/integration/laravelize.test.ts`

- [ ] **Step 1: Añadir los dos tests al describe existente**

Localiza el `describe('nuxt-laravelize integration', ...)` en `test/integration/laravelize.test.ts` y añade DENTRO del describe (al final, antes del cierre del callback) los siguientes dos `it` blocks:

```ts
  it('creates a user when the request body is valid', async () => {
    const response = await $fetch<{ id: string, email: string, name: string }>('/api/users', {
      method: 'POST',
      body: { email: 'ada@example.com', name: 'Ada Lovelace' },
    })

    expect(response.id).toMatch(/^user-/)
    expect(response.email).toBe('ada@example.com')
    expect(response.name).toBe('Ada Lovelace')
  })

  it('returns a 422 with Laravel-style errors when the body is invalid', async () => {
    let caught: { status: number, data: { message: string, errors: Record<string, string[]> } } | null = null
    try {
      await $fetch('/api/users', {
        method: 'POST',
        body: { email: 'not-an-email', name: '' },
      })
    }
    catch (error) {
      caught = error as typeof caught
    }

    expect(caught).not.toBeNull()
    expect(caught!.status).toBe(422)
    expect(caught!.data.message).toBe('Validation failed')
    expect(Object.keys(caught!.data.errors).sort()).toEqual(['body.email', 'body.name'])
  })
```

**Nota:** `$fetch` de `@nuxt/test-utils/e2e` lanza un error cuyo objeto tiene `status` y `data`. La estructura concreta puede variar entre versiones; si la aserción `caught!.status` falla por shape, ajusta a `caught!.statusCode` o usa `caught.response.status`. Verifica imprimiendo `console.log(caught)` en el primer fallo y adapta.

- [ ] **Step 2: Ejecutar la suite de integración**

Run: `pnpm exec vitest run test/integration/laravelize.test.ts`
Expected: PASS — 4 tests (2 previos + 2 nuevos).

- [ ] **Step 3: Ejecutar la suite completa**

Run: `pnpm dev:prepare && pnpm exec vitest run && pnpm lint && pnpm typecheck && pnpm prepack`
Expected: PASS — 53 tests (51 previos + 2 nuevos integration), lint limpio, typecheck limpio, prepack OK.

- [ ] **Step 4: Commit**

```bash
git add test/integration/laravelize.test.ts
git commit -m "feat: validate controllers + FormRequest with e2e tests"
```

---

## Cierre de F1

- [ ] **Verificación final**

Run: `pnpm exec vitest run`
Expected: 53 tests verdes (4 FormRequest + 7 validateFormRequest + 3 defineLaravelizedHandler + 3 templates + 2 kit + 23 core + 7 discovery + 4 integration = 53).

Run: `pnpm lint && pnpm typecheck && pnpm prepack`
Expected: sin errores.

- [ ] **Comprobación de criterios de aceptación del spec (sección 9)**

1. `defineLaravelizedHandler` resuelve via `useContainer(event) + container.make` — Task 4 unit tests + Task 7 e2e.
2. `body/query/params` validan independiente — Task 3 tests.
3. Inválido → 422 Laravel shape — Task 3 + Task 7 e2e.
4. `ValidatedInput<T>` infiere correctamente — verificable inspeccionando el tipo en `playground/server/controllers/UserController.ts:store(input)`.
5. Agnóstico Zod + Valibot — Task 3 (un test con Zod, uno con Valibot).
6. Auto-imports en server — Task 5 + Task 6 (el endpoint usa `defineLaravelizedHandler` sin import).
7. Suite verde — verificación final.

Tras este plan, F1 completo: la capa HTTP "Laravel-style" está operativa sobre F0. F2 (middleware, route binding, resources) puede arrancar encima.

# F2-A Implementation Plan — HTTP Middleware Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un pipeline de middleware Laravel-style integrado en `defineLaravelizedHandler`. Soporta middleware por-handler (via campo `middleware` en options) y globales (via `container.instance(globalMiddlewareToken, [...])` desde un provider).

**Architecture:** Nuevo bounded context `src/http/Middleware.ts` (interfaz), `src/http/MiddlewarePipeline.ts` (función pura Koa-style), `src/http/GlobalMiddleware.ts` (token público). Extensión de `defineLaravelizedHandler` para componer globals + per-handler + terminal (validación + controller). Sin nuevos módulos virtuales, sin cambios en `module.ts`. 100% aditivo dentro de `src/http/`.

**Tech Stack:** TypeScript estricto, h3 (`H3Event`), F0 (`Container`, `Token`, `useContainer`), Vitest 4 (con `vi.mock` para h3).

---

## Pre-condiciones

F0 + F1 en `main`, 53 tests verdes. Ejecuta `pnpm dev:prepare` si `.nuxt/` no existe.

---

## Task 1: `Middleware` interface + auto-import

Pieza tipográfica. Sin lógica, sin tests propios.

**Files:**
- Create: `src/http/Middleware.ts`
- Modify: `src/http/index.ts`
- Modify: `src/runtime/server/http/index.ts`

- [ ] **Step 1: Crear la interfaz**

Crea `src/http/Middleware.ts`:

```ts
import type { H3Event } from 'h3'

export interface Middleware {
  handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> | unknown
}
```

- [ ] **Step 2: Re-exportar desde el barrel público**

Edita `src/http/index.ts` y añade la línea correspondiente. El archivo completo queda:

```ts
export { FormRequest } from './FormRequest'
export type { ValidatedInput } from './ValidatedInput'
export { defineLaravelizedHandler } from './defineLaravelizedHandler'
export type { Middleware } from './Middleware'
```

- [ ] **Step 3: Añadir al re-export de auto-import**

`Middleware` es una interface (type-only). Las interfaces NO se auto-importan como values. Pero el patron Laravel define middlewares como **clases** que implementan `Middleware`, así que el usuario necesita acceso al tipo para `class AuthMiddleware implements Middleware`. Las clases del usuario importan `Middleware` desde el barrel público (`import type { Middleware } from '@luckys_luis/nuxt-laravelize'`), no via auto-import.

`src/runtime/server/http/index.ts` queda **sin cambios** en este step.

- [ ] **Step 4: Verificar typecheck + tests existentes**

Run: `pnpm dev:prepare && pnpm typecheck && pnpm lint && pnpm exec vitest run`
Expected: typecheck/lint limpios, 53 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add src/http/Middleware.ts src/http/index.ts
git commit -m "feat: add Middleware interface for HTTP pipeline"
```

---

## Task 2: `runMiddlewarePipeline` (función pura con TDD)

Composición Koa-style. Función pura, sin h3 más allá del tipo `H3Event`. Testable con middleware fakes.

**Files:**
- Create: `src/http/MiddlewarePipeline.ts`
- Create: `test/http/MiddlewarePipeline.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `test/http/MiddlewarePipeline.test.ts`:

```ts
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import type { Middleware } from '../../src/http/Middleware'
import { runMiddlewarePipeline } from '../../src/http/MiddlewarePipeline'

function createMockEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

describe('runMiddlewarePipeline', () => {
  it('runs terminal directly when the pipeline is empty', async () => {
    const result = await runMiddlewarePipeline(createMockEvent(), [], async () => 'terminal-value')

    expect(result).toBe('terminal-value')
  })

  it('passes through a single middleware that calls next', async () => {
    const middleware: Middleware = {
      async handle(_event, next) {
        return await next()
      },
    }

    const result = await runMiddlewarePipeline(createMockEvent(), [middleware], async () => 'terminal-value')

    expect(result).toBe('terminal-value')
  })

  it('executes multiple middlewares in declaration order then the terminal', async () => {
    const events: string[] = []

    const first: Middleware = {
      async handle(_event, next) {
        events.push('first:before')
        const value = await next()
        events.push('first:after')
        return value
      },
    }

    const second: Middleware = {
      async handle(_event, next) {
        events.push('second:before')
        const value = await next()
        events.push('second:after')
        return value
      },
    }

    await runMiddlewarePipeline(createMockEvent(), [first, second], async () => {
      events.push('terminal')
      return undefined
    })

    expect(events).toEqual([
      'first:before',
      'second:before',
      'terminal',
      'second:after',
      'first:after',
    ])
  })

  it('short-circuits the pipeline when a middleware does not call next', async () => {
    let terminalCalled = false

    const blocker: Middleware = {
      handle() {
        return 'blocked'
      },
    }

    const result = await runMiddlewarePipeline(createMockEvent(), [blocker], async () => {
      terminalCalled = true
      return 'terminal'
    })

    expect(result).toBe('blocked')
    expect(terminalCalled).toBe(false)
  })

  it('preserves modifications to the response after next() (around pattern)', async () => {
    const wrapper: Middleware = {
      async handle(_event, next) {
        const value = await next() as { value: string }
        return { value: `${value.value}-wrapped` }
      },
    }

    const result = await runMiddlewarePipeline(createMockEvent(), [wrapper], async () => ({ value: 'raw' }))

    expect(result).toEqual({ value: 'raw-wrapped' })
  })

  it('throws when a middleware calls next() twice', async () => {
    const buggy: Middleware = {
      async handle(_event, next) {
        await next()
        await next()
      },
    }

    await expect(runMiddlewarePipeline(createMockEvent(), [buggy], async () => 'terminal')).rejects.toThrow(/next\(\) called multiple times/)
  })
})
```

- [ ] **Step 2: Confirmar que el test falla**

Run: `pnpm exec vitest run test/http/MiddlewarePipeline.test.ts`
Expected: FAIL — `Cannot find module '../../src/http/MiddlewarePipeline'`.

- [ ] **Step 3: Implementar la función**

Crea `src/http/MiddlewarePipeline.ts`:

```ts
import type { H3Event } from 'h3'

import type { Middleware } from './Middleware'

export async function runMiddlewarePipeline(
  event: H3Event,
  middlewares: readonly Middleware[],
  terminal: () => Promise<unknown>,
): Promise<unknown> {
  let lastDispatched = -1

  async function dispatch(index: number): Promise<unknown> {
    if (index <= lastDispatched) {
      throw new Error('next() called multiple times')
    }

    lastDispatched = index

    if (index === middlewares.length) {
      return await terminal()
    }

    const middleware = middlewares[index]
    return await middleware!.handle(event, () => dispatch(index + 1))
  }

  return await dispatch(0)
}
```

**Nota sobre `noUncheckedIndexedAccess`:** TypeScript marca `middlewares[index]` como `Middleware | undefined`. El check `index === middlewares.length` arriba garantiza que `index < middlewares.length`, pero TS no puede inferirlo. El `!` non-null assertion es seguro aquí.

- [ ] **Step 4: Confirmar que los tests pasan**

Run: `pnpm exec vitest run test/http/MiddlewarePipeline.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: ambos limpios. Si lint flagueá el `!`, mantén la semántica — es necesario por `noUncheckedIndexedAccess`.

- [ ] **Step 6: Commit**

```bash
git add src/http/MiddlewarePipeline.ts test/http/MiddlewarePipeline.test.ts
git commit -m "feat: add runMiddlewarePipeline composer"
```

---

## Task 3: `globalMiddlewareToken`

Token público para que los usuarios registren la lista de middlewares globales como una "instance" en el container.

**Files:**
- Create: `src/http/GlobalMiddleware.ts`
- Modify: `src/http/index.ts`

- [ ] **Step 1: Crear el token**

Crea `src/http/GlobalMiddleware.ts`:

```ts
import type { Token } from '../core/container/Token'
import { createToken } from '../core/container/Token'

import type { Middleware } from './Middleware'

export const globalMiddlewareToken = createToken<readonly Token<Middleware>[]>('laravelize.globalMiddleware')
```

- [ ] **Step 2: Re-exportar desde el barrel**

Edita `src/http/index.ts`. El archivo completo queda:

```ts
export { FormRequest } from './FormRequest'
export type { ValidatedInput } from './ValidatedInput'
export { defineLaravelizedHandler } from './defineLaravelizedHandler'
export type { Middleware } from './Middleware'
export { globalMiddlewareToken } from './GlobalMiddleware'
```

`globalMiddlewareToken` es un valor runtime (un objeto `{ key }`), no un tipo. Va con `export` (no `export type`).

- [ ] **Step 3: Verificar typecheck + tests**

Run: `pnpm typecheck && pnpm lint && pnpm exec vitest run`
Expected: limpios, 59 tests verdes (53 prior + 6 nuevos de Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/http/GlobalMiddleware.ts src/http/index.ts
git commit -m "feat: add globalMiddlewareToken for pipeline composition"
```

---

## Task 4: Extender `defineLaravelizedHandler` con middleware

Integra el pipeline en el adapter. Añade el campo opcional `middleware` y resuelve globales del container.

**Files:**
- Modify: `src/http/defineLaravelizedHandler.ts`
- Modify: `test/http/defineLaravelizedHandler.test.ts`

- [ ] **Step 1: Añadir los 4 nuevos tests al archivo existente**

Edita `test/http/defineLaravelizedHandler.test.ts`. Después de los imports existentes, añade:

```ts
import { globalMiddlewareToken } from '../../src/http/GlobalMiddleware'
import type { Middleware } from '../../src/http/Middleware'
```

Dentro del `describe('defineLaravelizedHandler', ...)` existente, añade estos 4 tests AL FINAL (antes del cierre del `describe`):

```ts
  it('executes per-handler middleware before the controller', async () => {
    const events: string[] = []

    const tracingMiddleware: Middleware = {
      async handle(_event, next) {
        events.push('middleware:before')
        const value = await next()
        events.push('middleware:after')
        return value
      },
    }

    const tracingToken = createToken<Middleware>('tracing-middleware')
    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(async () => {
        events.push('controller:index')
        return [{ id: 'user-1' }]
      }),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === tracingToken) return tracingMiddleware
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn().mockReturnValue(false),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [tracingToken],
    })

    await handler(createMockEvent())

    expect(events).toEqual(['middleware:before', 'controller:index', 'middleware:after'])
  })

  it('runs global middleware (registered via globalMiddlewareToken) before per-handler middleware', async () => {
    const events: string[] = []

    const makeTracing = (label: string): Middleware => ({
      async handle(_event, next) {
        events.push(`${label}:before`)
        const value = await next()
        events.push(`${label}:after`)
        return value
      },
    })

    const globalToken = createToken<Middleware>('global-middleware')
    const perHandlerToken = createToken<Middleware>('per-handler-middleware')
    const globalInstance = makeTracing('global')
    const perHandlerInstance = makeTracing('per-handler')

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(async () => {
        events.push('controller:index')
        return []
      }),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === globalMiddlewareToken) return [globalToken]
        if (token === globalToken) return globalInstance
        if (token === perHandlerToken) return perHandlerInstance
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn((token) => token === globalMiddlewareToken),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [perHandlerToken],
    })

    await handler(createMockEvent())

    expect(events).toEqual([
      'global:before',
      'per-handler:before',
      'controller:index',
      'per-handler:after',
      'global:after',
    ])
  })

  it('runs only per-handler middleware when globalMiddlewareToken is not registered', async () => {
    const events: string[] = []

    const perHandlerToken = createToken<Middleware>('per-handler-middleware')
    const perHandlerInstance: Middleware = {
      async handle(_event, next) {
        events.push('per-handler:before')
        const value = await next()
        events.push('per-handler:after')
        return value
      },
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(async () => {
        events.push('controller:index')
        return []
      }),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === perHandlerToken) return perHandlerInstance
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn().mockReturnValue(false),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [perHandlerToken],
    })

    await handler(createMockEvent())

    expect(events).toEqual(['per-handler:before', 'controller:index', 'per-handler:after'])
  })

  it('does not invoke the controller when a middleware short-circuits the pipeline', async () => {
    const blockingToken = createToken<Middleware>('blocking-middleware')
    const blockingInstance: Middleware = {
      handle() {
        return { status: 'blocked' }
      },
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    const container = {
      make: vi.fn((token) => {
        if (token === blockingToken) return blockingInstance
        if (token === usersControllerToken) return controller
        throw new Error(`Unknown token: ${(token as { key: string }).key}`)
      }),
      has: vi.fn().mockReturnValue(false),
    } as unknown as Container

    vi.mocked(useContainer).mockReturnValue(container)

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
      middleware: [blockingToken],
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual({ status: 'blocked' })
    expect(controller.index).not.toHaveBeenCalled()
  })
```

**Nota:** los tests existentes que usan `createMockContainer` siguen siendo válidos para los 3 tests iniciales; los 4 tests nuevos definen su propio `container` inline porque necesitan mockear `make` y `has` con lógica condicional.

- [ ] **Step 2: Confirmar que los 4 tests nuevos fallan**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: FAIL — los 3 tests existentes siguen verdes, los 4 nuevos fallan porque el adapter actual no soporta `middleware` ni resuelve globales.

- [ ] **Step 3: Modificar el adapter**

Sustituye el contenido completo de `src/http/defineLaravelizedHandler.ts` por:

```ts
import { defineEventHandler, type EventHandler } from 'h3'

import type { Token } from '../core/container/Token'
import { useContainer } from '../runtime/server/utils/useContainer'

import type { FormRequest } from './FormRequest'
import { globalMiddlewareToken } from './GlobalMiddleware'
import type { Middleware } from './Middleware'
import { runMiddlewarePipeline } from './MiddlewarePipeline'
import { validateFormRequest } from './validateFormRequest'

interface LaravelizedHandlerOptions<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
> {
  controller: Token<TController>
  method: TMethod
  request?: new () => TRequest
  middleware?: readonly Token<Middleware>[]
}

export function defineLaravelizedHandler<
  TController extends object,
  TMethod extends keyof TController,
  TRequest extends FormRequest = never,
>(options: LaravelizedHandlerOptions<TController, TMethod, TRequest>): EventHandler {
  return defineEventHandler(async (event) => {
    const container = useContainer(event)
    const globals = container.has(globalMiddlewareToken) ? container.make(globalMiddlewareToken) : []
    const perHandler = options.middleware ?? []
    const middlewares = [...globals, ...perHandler].map(token => container.make(token))

    return await runMiddlewarePipeline(event, middlewares, async () => {
      const controller = container.make(options.controller)
      const input = options.request
        ? await validateFormRequest(event, new options.request())
        : { body: undefined, query: undefined, params: undefined }
      const method = controller[options.method] as (input: unknown) => unknown
      return await method.call(controller, input)
    })
  })
}
```

- [ ] **Step 4: Confirmar que los 7 tests pasan**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: PASS — 7 tests (3 existentes + 4 nuevos).

- [ ] **Step 5: Lint + typecheck + suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm exec vitest run`
Expected: limpios, 63 tests verdes (53 prior + 6 MiddlewarePipeline + 4 nuevos defineLaravelizedHandler).

- [ ] **Step 6: Commit**

```bash
git add src/http/defineLaravelizedHandler.ts test/http/defineLaravelizedHandler.test.ts
git commit -m "feat: integrate middleware pipeline into defineLaravelizedHandler"
```

---

## Task 5: Playground — middlewares + provider + endpoint

Demuestra el uso real: un `LoggingMiddleware` global que añade un header a la respuesta y un `BlockingMiddleware` per-handler que corta la cadena con 403. Más un controller protegido.

**Files:**
- Create: `playground/server/middleware/middlewareTokens.ts`
- Create: `playground/server/middleware/LoggingMiddleware.ts`
- Create: `playground/server/middleware/BlockingMiddleware.ts`
- Create: `playground/server/providers/MiddlewareProvider.ts`
- Create: `playground/server/controllers/protectedTokens.ts`
- Create: `playground/server/controllers/ProtectedController.ts`
- Create: `playground/server/providers/ProtectedControllerProvider.ts`
- Create: `playground/server/api/protected.get.ts`

- [ ] **Step 1: Tokens de middlewares**

Crea `playground/server/middleware/middlewareTokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'
import type { Middleware } from '../../../src/http/Middleware'

export const loggingMiddlewareToken = createToken<Middleware>('playground.logging-middleware')
export const blockingMiddlewareToken = createToken<Middleware>('playground.blocking-middleware')
```

- [ ] **Step 2: LoggingMiddleware (global)**

Crea `playground/server/middleware/LoggingMiddleware.ts`:

```ts
import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

import type { Middleware } from '../../../src/http/Middleware'

export class LoggingMiddleware implements Middleware {
  async handle(event: H3Event, next: () => Promise<unknown>): Promise<unknown> {
    const response = await next()
    setResponseHeader(event, 'x-laravelize-logged', 'true')
    return response
  }
}
```

- [ ] **Step 3: BlockingMiddleware (per-handler)**

Crea `playground/server/middleware/BlockingMiddleware.ts`:

```ts
import { createError } from 'h3'

import type { Middleware } from '../../../src/http/Middleware'

export class BlockingMiddleware implements Middleware {
  handle(): unknown {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      data: { message: 'Blocked by middleware' },
    })
  }
}
```

- [ ] **Step 4: Provider que registra middlewares y globales**

Crea `playground/server/providers/MiddlewareProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import { globalMiddlewareToken } from '../../../src/http/GlobalMiddleware'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { BlockingMiddleware } from '../middleware/BlockingMiddleware'
import { LoggingMiddleware } from '../middleware/LoggingMiddleware'
import { blockingMiddlewareToken, loggingMiddlewareToken } from '../middleware/middlewareTokens'

export default class MiddlewareProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(loggingMiddlewareToken, () => new LoggingMiddleware())
    container.scoped(blockingMiddlewareToken, () => new BlockingMiddleware())

    container.instance(globalMiddlewareToken, [loggingMiddlewareToken])
  }
}
```

- [ ] **Step 5: ProtectedController + token + provider**

Crea `playground/server/controllers/protectedTokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'

export interface ProtectedControllerContract {
  index(input: { body: undefined, query: undefined, params: undefined }): { message: string }
}

export const protectedControllerToken = createToken<ProtectedControllerContract>('playground.protected-controller')
```

Crea `playground/server/controllers/ProtectedController.ts`:

```ts
import type { ProtectedControllerContract } from './protectedTokens'

export class ProtectedController implements ProtectedControllerContract {
  index(_input: { body: undefined, query: undefined, params: undefined }): { message: string } {
    return { message: 'protected resource' }
  }
}
```

Crea `playground/server/providers/ProtectedControllerProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { ProtectedController } from '../controllers/ProtectedController'
import { protectedControllerToken } from '../controllers/protectedTokens'

export default class ProtectedControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(protectedControllerToken, () => new ProtectedController())
  }
}
```

- [ ] **Step 6: Endpoint protected**

Crea `playground/server/api/protected.get.ts`:

```ts
import { blockingMiddlewareToken } from '../middleware/middlewareTokens'
import { protectedControllerToken } from '../controllers/protectedTokens'

export default defineLaravelizedHandler({
  controller: protectedControllerToken,
  method: 'index',
  middleware: [blockingMiddlewareToken],
})
```

`defineLaravelizedHandler` viene del auto-import (sin import explícito).

- [ ] **Step 7: Verificar build y suite**

Run: `pnpm dev:prepare && pnpm typecheck && pnpm lint && pnpm exec vitest run && pnpm prepack`
Expected: typecheck/lint limpios, 63 tests verdes (sin nuevos en Task 5), prepack OK.

- [ ] **Step 8: Commit**

```bash
git add playground/server/middleware/ playground/server/providers/MiddlewareProvider.ts playground/server/providers/ProtectedControllerProvider.ts playground/server/controllers/protectedTokens.ts playground/server/controllers/ProtectedController.ts playground/server/api/protected.get.ts
git commit -m "feat(playground): demonstrate middleware pipeline with logging and blocking"
```

---

## Task 6: Integration tests + cierre

Añade 2 tests e2e al archivo de integración existente para validar globales + per-handler corta-cadena end-to-end.

**Files:**
- Modify: `test/integration/laravelize.test.ts`

- [ ] **Step 1: Añadir los 2 tests al describe existente**

Localiza el `describe('nuxt-laravelize integration', () => { ... })` y añade DENTRO (al final del describe, antes del `})`) los siguientes 2 `it` blocks:

```ts
  it('applies global middleware to every request (sets x-laravelize-logged header)', async () => {
    const response = await $fetch.raw<{ counterValue: number, requestId: string }>('/api/laravelize')

    expect(response.headers.get('x-laravelize-logged')).toBe('true')
  })

  it('returns 403 from per-handler middleware without invoking the controller', async () => {
    interface FetchErrorShape {
      status?: number
      statusCode?: number
      data?: { data?: { message: string } }
      response?: { status: number, _data?: { data?: { message: string } } }
    }

    let caught: FetchErrorShape | null = null
    try {
      await $fetch('/api/protected')
    }
    catch (error) {
      caught = error as FetchErrorShape
    }

    expect(caught).not.toBeNull()

    const status = caught?.status ?? caught?.statusCode ?? caught?.response?.status
    expect(status).toBe(403)

    const payload = caught?.data?.data ?? caught?.response?._data?.data
    expect(payload?.message).toBe('Blocked by middleware')
  })
```

**Nota sobre `$fetch.raw`:** `@nuxt/test-utils/e2e` expone `$fetch` (returns parsed body) y `$fetch.raw` (returns the full response with headers). El primer test usa `.raw` para acceder a los headers de respuesta.

- [ ] **Step 2: Ejecutar tests de integración**

Run: `pnpm exec vitest run test/integration/laravelize.test.ts`
Expected: PASS — 6 tests (4 prior + 2 nuevos).

- [ ] **Step 3: Suite completa + checks**

Run: `pnpm dev:prepare && pnpm exec vitest run && pnpm lint && pnpm typecheck && pnpm prepack`
Expected: 65 tests verdes (63 prior + 2 nuevos), lint/typecheck limpios, prepack OK.

- [ ] **Step 4: Commit**

```bash
git add test/integration/laravelize.test.ts
git commit -m "feat: validate middleware pipeline with e2e tests"
```

---

## Cierre de F2-A

- [ ] **Verificación final**

Run: `pnpm exec vitest run`
Expected: 65 tests verdes
- 4 FormRequest + 7 validateFormRequest + 7 defineLaravelizedHandler + 6 MiddlewarePipeline (F1 + F2-A http)
- 3 templates + 2 kit (F0-B utils)
- 23 core + 7 discovery (F0)
- 6 integration

Run: `pnpm lint && pnpm typecheck && pnpm prepack`
Expected: sin errores.

- [ ] **Comprobación de criterios de aceptación (spec sección 9)**

1. `Middleware` exportada — Task 1 (barrel public).
2. `runMiddlewarePipeline` con pipeline vacío llama terminal — Task 2 test 1.
3. Per-handler middleware en orden — Task 4 test 1 + Task 6 e2e blocking.
4. Globales ejecutan antes — Task 4 test 2.
5. Sin `next()` corta cadena — Task 4 test 4 + Task 6 e2e blocking.
6. Around preserva modificaciones — Task 2 test 5.
7. Suite verde con 65 tests — verificación final.

Tras este plan, F2-A completo: middleware pipeline operativo sobre F1. F2-B (route binding), F2-C (resources), y F2-D (authorization) pueden arrancar encima.

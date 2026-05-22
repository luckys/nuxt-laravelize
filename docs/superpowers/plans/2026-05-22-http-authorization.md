# F2-D HTTP Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Laravel-style authorization to `nuxt-laravelize` via a `Gate` primitive (define/allows/denies) in a new `src/auth/` bounded context, plus an optional `authorize?(event)` hook in `FormRequest` that runs between the F2-A middleware pipeline and F1 validation.

**Architecture:** New `src/auth/` directory with `Gate` interface, `InMemoryGate` implementation, `GateRuleNotDefinedError`, and `gateToken`. `FormRequest` gets an optional `authorize?(event): boolean | Promise<boolean>` method. `defineLaravelizedHandler` invokes it inside the pipeline terminal before validation; on `false` it throws `createError(403)` with Laravel shape `{ message: 'This action is unauthorized.' }`. No policies, no implicit user resolution, no route-level declarative authorize — those are future scope.

**Tech Stack:** TypeScript, Nuxt 4 module, h3, awilix DI, `@nuxt/test-utils/e2e`, Vitest 4, Zod 4 (playground). No new runtime dependencies.

**Reference spec:** `docs/superpowers/specs/2026-05-22-http-authorization-design.md`

**Project conventions (every commit MUST satisfy):**
- No semicolons, single quotes, trailing commas
- No `else`; one level of indentation per method; no abbreviations; no comments
- `#` private fields when applicable
- ESLint + typecheck must be green before every commit
- TDD strict: write failing test → see it fail → implement → see it pass → commit
- Run `pnpm dev:prepare` after any change that affects auto-imports or playground structure (this regenerates `.nuxt/tsconfig.json`)
- **All work commits directly to `main`** (project policy)

---

## Task 1: Gate interface + InMemoryGate + GateRuleNotDefinedError (TDD)

**Files:**
- Create: `src/auth/Gate.ts`
- Create: `src/auth/GateRuleNotDefinedError.ts`
- Create: `test/auth/Gate.test.ts`

- [ ] **Step 1: Create directories**

Run: `mkdir -p src/auth test/auth`

- [ ] **Step 2: Write the failing tests**

Create `test/auth/Gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { GateRuleNotDefinedError } from '../../src/auth/GateRuleNotDefinedError'
import { InMemoryGate } from '../../src/auth/Gate'

describe('InMemoryGate', () => {
  it('invokes a registered sync callback and returns its boolean result', async () => {
    const gate = new InMemoryGate()
    gate.define('always', () => true)

    expect(await gate.allows('always')).toBe(true)
  })

  it('invokes a registered async callback and resolves to its boolean result', async () => {
    const gate = new InMemoryGate()
    gate.define('async-allow', async () => true)

    expect(await gate.allows('async-allow')).toBe(true)
  })

  it('passes positional args to the callback in the order they were given', async () => {
    const received: unknown[] = []
    const gate = new InMemoryGate()
    gate.define('inspect', (...args) => {
      received.push(...args)
      return true
    })

    await gate.allows('inspect', { id: 1 }, 'role', 42)

    expect(received).toEqual([{ id: 1 }, 'role', 42])
  })

  it('returns false from allows when the callback returns false', async () => {
    const gate = new InMemoryGate()
    gate.define('always-deny', () => false)

    expect(await gate.allows('always-deny')).toBe(false)
  })

  it('denies is the negation of allows', async () => {
    const gate = new InMemoryGate()
    gate.define('allow', () => true)
    gate.define('deny', () => false)

    expect(await gate.denies('allow')).toBe(false)
    expect(await gate.denies('deny')).toBe(true)
  })

  it('throws GateRuleNotDefinedError when allows is called with an unknown rule', async () => {
    const gate = new InMemoryGate()

    await expect(gate.allows('missing')).rejects.toBeInstanceOf(GateRuleNotDefinedError)
    await expect(gate.allows('missing')).rejects.toThrow('Gate rule "missing" is not defined.')
  })

  it('overwrites a previously defined rule (last wins)', async () => {
    const gate = new InMemoryGate()
    gate.define('rule', () => true)
    gate.define('rule', () => false)

    expect(await gate.allows('rule')).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec vitest run test/auth/Gate.test.ts`
Expected: FAIL with "Cannot find module '../../src/auth/Gate'" or similar.

- [ ] **Step 4: Implement GateRuleNotDefinedError**

Create `src/auth/GateRuleNotDefinedError.ts`:

```ts
export class GateRuleNotDefinedError extends Error {
  constructor(rule: string) {
    super(`Gate rule "${rule}" is not defined.`)
    this.name = 'GateRuleNotDefinedError'
  }
}
```

- [ ] **Step 5: Implement Gate interface + InMemoryGate**

Create `src/auth/Gate.ts`:

```ts
import { GateRuleNotDefinedError } from './GateRuleNotDefinedError'

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

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run test/auth/Gate.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 7: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both green. If typecheck fails because `.nuxt/tsconfig.json` is missing, run `pnpm dev:prepare` first.

- [ ] **Step 8: Commit**

```bash
git add src/auth/Gate.ts src/auth/GateRuleNotDefinedError.ts test/auth/Gate.test.ts
git commit -m "feat(auth): add Gate primitive with InMemoryGate implementation

Gate exposes define/allows/denies with async-first signatures. InMemoryGate
stores rules in a private Map; unknown rules throw GateRuleNotDefinedError."
```

---

## Task 2: Gate token + auth barrel

**Files:**
- Create: `src/auth/GateToken.ts`
- Create: `src/auth/index.ts`

- [ ] **Step 1: Create the token**

Create `src/auth/GateToken.ts`:

```ts
import { createToken } from '../core/container/Token'

import type { Gate } from './Gate'

export const gateToken = createToken<Gate>('laravelize.gate')
```

- [ ] **Step 2: Create the barrel**

Create `src/auth/index.ts`:

```ts
export type { Gate, GateCallback } from './Gate'
export { InMemoryGate } from './Gate'
export { GateRuleNotDefinedError } from './GateRuleNotDefinedError'
export { gateToken } from './GateToken'
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/auth/GateToken.ts src/auth/index.ts
git commit -m "feat(auth): export gateToken and auth barrel

gateToken is the DI key consumers register a Gate instance under from a
ServiceProvider."
```

---

## Task 3: Add `authorize?(event)` to FormRequest

**Files:**
- Modify: `src/http/FormRequest.ts`

- [ ] **Step 1: Read the current file**

Current content of `src/http/FormRequest.ts`:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
}
```

- [ ] **Step 2: Add the authorize signature**

Replace the file with:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Event } from 'h3'

export abstract class FormRequest {
  body?(): StandardSchemaV1
  query?(): StandardSchemaV1
  params?(): StandardSchemaV1
  authorize?(event: H3Event): boolean | Promise<boolean>
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: green (existing FormRequest subclasses don't implement `authorize`, so the optional method is satisfied).

- [ ] **Step 4: Commit**

```bash
git add src/http/FormRequest.ts
git commit -m "feat(http): add optional authorize hook to FormRequest

authorize?(event): boolean | Promise<boolean> mirrors body/query/params:
optional, sync or async. The handler runs it between middleware and
validation; returning false yields a 403."
```

---

## Task 4: Integrate authorize into defineLaravelizedHandler (TDD)

**Files:**
- Modify: `src/http/defineLaravelizedHandler.ts`
- Modify: `test/http/defineLaravelizedHandler.test.ts`

- [ ] **Step 1: Write the failing tests**

Append the following three `it(...)` blocks inside the existing `describe('defineLaravelizedHandler', ...)` block in `test/http/defineLaravelizedHandler.test.ts`, immediately before the closing `})`:

```ts
  it('throws a 403 with the Laravel-style payload when authorize returns false', async () => {
    class CreatePostRequest extends FormRequest {
      override body() {
        return z.object({ title: z.string() })
      }

      override authorize() {
        return false
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreatePostRequest,
    })

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 403,
      data: { message: 'This action is unauthorized.' },
    })

    expect(controller.store).not.toHaveBeenCalled()
  })

  it('continues to validation and the controller when authorize returns true', async () => {
    class CreatePostRequest extends FormRequest {
      override body() {
        return z.object({ title: z.string() })
      }

      override authorize() {
        return true
      }
    }

    const controller: UsersController = {
      store: vi.fn().mockResolvedValue({ id: 'post-1' }),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))
    vi.mocked(h3.readBody).mockResolvedValue({ title: 'Hello' })

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreatePostRequest,
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual({ id: 'post-1' })
    expect(controller.store).toHaveBeenCalledWith({
      body: { title: 'Hello' },
      query: undefined,
      params: undefined,
    })
  })

  it('awaits an async authorize that resolves false and short-circuits before validation runs', async () => {
    const readBodySpy = vi.mocked(h3.readBody)
    readBodySpy.mockReset()

    class CreatePostRequest extends FormRequest {
      override body() {
        return z.object({ title: z.string() })
      }

      override async authorize() {
        return false
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn(),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'store',
      request: CreatePostRequest,
    })

    await expect(handler(createMockEvent())).rejects.toMatchObject({
      statusCode: 403,
    })

    expect(controller.store).not.toHaveBeenCalled()
    expect(readBodySpy).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: the three new tests FAIL (the first probably hangs or throws something other than 403; the third's `expect(readBodySpy).not.toHaveBeenCalled()` fails because validation still runs).

- [ ] **Step 3: Update defineLaravelizedHandler to invoke authorize**

Current content of `src/http/defineLaravelizedHandler.ts`:

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

Replace it with:

```ts
import { createError, defineEventHandler, type EventHandler } from 'h3'

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
  })
}
```

Key changes:
- Added `createError` to the h3 import.
- Instantiate `request` once at the top of the terminal (instead of inside the validation ternary), so `authorize` and `validateFormRequest` share the same instance.
- New `if (request?.authorize)` block runs before validation.

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: all tests PASS (the previously-existing tests should still pass because instantiating the `request` once instead of twice is observationally equivalent when `authorize` is absent).

- [ ] **Step 5: Run the full unit suite**

Run: `pnpm exec vitest run`
Expected: all tests green, including F0/F1/F2-A. If anything fails, the most likely culprit is the request-instantiation refactor — check that the existing `it('resolves the controller from the container...')` test still passes.

- [ ] **Step 6: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add src/http/defineLaravelizedHandler.ts test/http/defineLaravelizedHandler.test.ts
git commit -m "feat(http): invoke FormRequest.authorize between middleware and validation

The pipeline terminal now instantiates FormRequest once, calls authorize if
present, and throws createError(403) with { message: 'This action is
unauthorized.' } when it returns false. Validation only runs when authorize
returns true (or is absent), matching Laravel semantics."
```

---

## Task 5: Re-export auth from http barrel and auto-import via runtime

**Files:**
- Modify: `src/http/index.ts`
- Modify: `src/runtime/server/http/index.ts`

- [ ] **Step 1: Read both files**

Current `src/http/index.ts`:

```ts
export { FormRequest } from './FormRequest'
export type { ValidatedInput } from './ValidatedInput'
export { defineLaravelizedHandler } from './defineLaravelizedHandler'
export type { Middleware } from './Middleware'
export { globalMiddlewareToken } from './GlobalMiddleware'
```

Current `src/runtime/server/http/index.ts`:

```ts
export { FormRequest } from '../../../http/FormRequest'
export { defineLaravelizedHandler } from '../../../http/defineLaravelizedHandler'
```

- [ ] **Step 2: Update src/http/index.ts**

Replace the file with:

```ts
export { FormRequest } from './FormRequest'
export type { ValidatedInput } from './ValidatedInput'
export { defineLaravelizedHandler } from './defineLaravelizedHandler'
export type { Middleware } from './Middleware'
export { globalMiddlewareToken } from './GlobalMiddleware'

export type { Gate, GateCallback } from '../auth/Gate'
export { InMemoryGate } from '../auth/Gate'
export { GateRuleNotDefinedError } from '../auth/GateRuleNotDefinedError'
export { gateToken } from '../auth/GateToken'
```

- [ ] **Step 3: Update src/runtime/server/http/index.ts**

Replace the file with:

```ts
export { FormRequest } from '../../../http/FormRequest'
export { defineLaravelizedHandler } from '../../../http/defineLaravelizedHandler'
export { gateToken } from '../../../auth/GateToken'
export { InMemoryGate } from '../../../auth/Gate'
```

(We auto-import `gateToken` and `InMemoryGate` because both are commonly used in `server/providers/` and `server/http/` files. `Gate`, `GateCallback`, and `GateRuleNotDefinedError` stay as type-only / less-common imports — users import them explicitly when needed.)

- [ ] **Step 4: Regenerate Nuxt auto-imports**

Run: `pnpm dev:prepare`
Expected: completes without error. This regenerates `.nuxt/types/nitro-imports.d.ts` so the playground sees `gateToken` and `InMemoryGate` as auto-imports.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/http/index.ts src/runtime/server/http/index.ts
git commit -m "feat(http): expose Gate exports through public barrel and server auto-imports

src/http/index.ts re-exports the auth bounded context so external consumers
can import everything from the package root. runtime/server/http/index.ts
adds gateToken and InMemoryGate to the Nitro auto-import set; less-common
symbols (Gate type, GateCallback, GateRuleNotDefinedError) stay as
explicit imports."
```

---

## Task 6: Playground setup (provider, FormRequest, endpoint, user injection)

The playground follows a strict convention discovered by reading `UserControllerProvider.ts`, `controllers/userTokens.ts`, `controllers/UserController.ts`, `requests/CreateUserRequest.ts`, and `api/users.post.ts`:

- Controller class in `controllers/<X>Controller.ts` (implements a contract interface)
- Token + interface contract in `controllers/<x>Tokens.ts`
- Provider in `providers/<X>ControllerProvider.ts` using `container.scoped(...)`
- FormRequest in `requests/<X>Request.ts`
- Endpoint in `api/<route>.<method>.ts`

All playground imports use absolute paths into `../../../src/...` (workspace setup).

**Files:**
- Create: `playground/server/controllers/postsTokens.ts`
- Create: `playground/server/controllers/PostsController.ts`
- Create: `playground/server/providers/PostsControllerProvider.ts`
- Create: `playground/server/providers/GateProvider.ts`
- Create: `playground/server/requests/CreatePostRequest.ts`
- Create: `playground/server/api/posts.post.ts`
- Create: `playground/server/middleware/inject-user.ts`
- Create: `playground/server/types.d.ts` (only if `event.context.user` triggers a TS error in step 9)

- [ ] **Step 1: Create the controller token + contract**

Create `playground/server/controllers/postsTokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'

export interface PostsControllerContract {
  create(input: { body: { title: string, content: string }, query: undefined, params: undefined }): { id: string, title: string }
}

export const postsControllerToken = createToken<PostsControllerContract>('playground.posts-controller')
```

- [ ] **Step 2: Create the controller class**

Create `playground/server/controllers/PostsController.ts`:

```ts
import type { PostsControllerContract } from './postsTokens'

export class PostsController implements PostsControllerContract {
  #nextId = 1

  create(input: { body: { title: string, content: string }, query: undefined, params: undefined }): { id: string, title: string } {
    const id = `post-${this.#nextId}`
    this.#nextId += 1
    return { id, title: input.body.title }
  }
}
```

- [ ] **Step 3: Create the controller provider**

Create `playground/server/providers/PostsControllerProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { PostsController } from '../controllers/PostsController'
import { postsControllerToken } from '../controllers/postsTokens'

export default class PostsControllerProvider implements ServiceProvider {
  register(container: Container): void {
    container.scoped(postsControllerToken, () => new PostsController())
  }
}
```

- [ ] **Step 4: Create the GateProvider**

Create `playground/server/providers/GateProvider.ts`:

```ts
import type { Container } from '../../../src/core/container/Container'
import type { ServiceProvider } from '../../../src/core/providers/ServiceProvider'

import { InMemoryGate } from '../../../src/auth/Gate'
import { gateToken } from '../../../src/auth/GateToken'

interface AuthorContext {
  role: string
}

export default class GateProvider implements ServiceProvider {
  register(container: Container): void {
    container.singleton(gateToken, () => {
      const gate = new InMemoryGate()
      gate.define('create-post', (user) => {
        const author = user as AuthorContext | undefined
        return author?.role === 'author'
      })
      return gate
    })
  }
}
```

Note: `container.singleton` is used here (one Gate per app lifetime); `container.scoped` is for per-request services like controllers and middleware. If `singleton` doesn't exist on `Container`, check `src/core/container/Container.ts` for the correct lifetime method name and adjust.

- [ ] **Step 5: Create the FormRequest**

Create `playground/server/requests/CreatePostRequest.ts`:

```ts
import type { H3Event } from 'h3'
import { z } from 'zod'

import { gateToken } from '../../../src/auth/GateToken'
import { FormRequest } from '../../../src/http/FormRequest'
import { useContainer } from '../../../src/runtime/server/utils/useContainer'

export class CreatePostRequest extends FormRequest {
  override body() {
    return z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    })
  }

  override async authorize(event: H3Event): Promise<boolean> {
    const gate = useContainer(event).make(gateToken)
    const user = event.context.user
    if (!user) return false
    return await gate.allows('create-post', user)
  }
}
```

- [ ] **Step 6: Create the endpoint**

Create `playground/server/api/posts.post.ts`:

```ts
import { defineLaravelizedHandler } from '../../../src/http/defineLaravelizedHandler'

import { postsControllerToken } from '../controllers/postsTokens'
import { CreatePostRequest } from '../requests/CreatePostRequest'

export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'create',
  request: CreatePostRequest,
})
```

- [ ] **Step 7: Create the Nitro user-injection middleware**

Create `playground/server/middleware/inject-user.ts`:

```ts
import { defineEventHandler, getRequestHeader } from 'h3'

export default defineEventHandler((event) => {
  const role = getRequestHeader(event, 'x-user-role')
  if (role) {
    event.context.user = { role }
  }
})
```

This is a **Nitro** middleware (auto-scanned from `server/middleware/`), not a `Middleware` class from F2-A. It only reads a header and sets `event.context.user` so the integration tests can drive `authorize()` from the outside.

- [ ] **Step 8: Regenerate Nuxt auto-imports**

Run: `pnpm dev:prepare`
Expected: completes without error. This also re-discovers the new providers via the convention scanner (the providers are at `playground/server/providers/*Provider.ts`, the same path the existing ones live in).

- [ ] **Step 9: Run typecheck**

Run: `pnpm typecheck`
Expected: green.

If `event.context.user` triggers a TS error like "Property 'user' does not exist on type 'H3EventContext'", create `playground/server/types.d.ts`:

```ts
declare module 'h3' {
  interface H3EventContext {
    user?: { role: string }
  }
}

export {}
```

Then re-run `pnpm typecheck` — should now be green.

- [ ] **Step 10: Smoke-check the playground**

Run: `pnpm dev` (in one terminal). Wait for the dev server to print its URL.

In another terminal:

```bash
curl -s -X POST http://localhost:3000/api/posts \
  -H 'Content-Type: application/json' \
  -H 'x-user-role: author' \
  -d '{"title":"Hello","content":"World"}'
```

Expected: `{"id":"post-1","title":"Hello"}` (or similar — the id counter resets on dev-server restart).

Then:

```bash
curl -s -X POST http://localhost:3000/api/posts \
  -H 'Content-Type: application/json' \
  -d '{"title":"Hello","content":"World"}'
```

Expected: an error body that includes `"This action is unauthorized."` and a 403 status (use `-i` to see the status line if needed). h3 typically wraps it as `{"data":{"message":"This action is unauthorized."},"statusCode":403,...}`.

Stop the dev server (Ctrl+C).

- [ ] **Step 11: Commit**

```bash
git add playground/server/controllers/postsTokens.ts \
        playground/server/controllers/PostsController.ts \
        playground/server/providers/PostsControllerProvider.ts \
        playground/server/providers/GateProvider.ts \
        playground/server/requests/CreatePostRequest.ts \
        playground/server/api/posts.post.ts \
        playground/server/middleware/inject-user.ts
# Only add playground/server/types.d.ts if you created it in Step 9:
# git add playground/server/types.d.ts
git commit -m "feat(playground): demonstrate Gate-backed authorize hook on POST /api/posts

GateProvider registers an in-memory Gate defining the 'create-post' rule
(user.role === 'author'). CreatePostRequest reads event.context.user
(populated by the inject-user Nitro middleware from the x-user-role header)
and delegates to gate.allows('create-post', user). PostsController returns
a fake post id; the smoke test confirms 200 with the header and 403 without."
```

---

## Task 7: Integration tests + final suite + cleanup

**Files:**
- Modify: `test/integration/laravelize.test.ts`

- [ ] **Step 1: Read the integration test file**

Re-read `test/integration/laravelize.test.ts` to confirm the exact `FetchErrorShape` interface and error-shape extraction pattern used by the existing 403-from-middleware test.

- [ ] **Step 2: Append the two new tests**

Add two new `it(...)` blocks at the end of the `describe('nuxt-laravelize integration', ...)` block, before the closing `})`:

```ts
  it('creates a post when the user is authorized', async () => {
    const response = await $fetch<{ id: string, title: string }>('/api/posts', {
      method: 'POST',
      headers: { 'x-user-role': 'author' },
      body: { title: 'Hello', content: 'World' },
    })

    expect(response.id).toMatch(/^post-/)
    expect(response.title).toBe('Hello')
  })

  it('returns 403 with the Laravel unauthorized message when the user is not authorized', async () => {
    interface FetchErrorShape {
      status?: number
      statusCode?: number
      data?: { data?: { message: string } }
      response?: { status: number, _data?: { data?: { message: string } } }
    }

    let caught: FetchErrorShape | null = null
    try {
      await $fetch('/api/posts', {
        method: 'POST',
        body: { title: 'Hello', content: 'World' },
      })
    }
    catch (error) {
      caught = error as FetchErrorShape
    }

    expect(caught).not.toBeNull()

    const status = caught?.status ?? caught?.statusCode ?? caught?.response?.status
    expect(status).toBe(403)

    const payload = caught?.data?.data ?? caught?.response?._data?.data
    expect(payload?.message).toBe('This action is unauthorized.')
  })
```

The first test sends `x-user-role: author` so the Nitro middleware injects an author user; the second omits the header so `event.context.user` stays undefined and `authorize` returns false.

- [ ] **Step 3: Clean up stale Nuxt build cache before running e2e**

(This avoids the known false-failure pattern documented across earlier phases.)

Run: `rm -rf .nuxt playground/.nuxt && pnpm dev:prepare`
Expected: completes without error.

- [ ] **Step 4: Run the integration tests**

Run: `pnpm exec vitest run test/integration/laravelize.test.ts`
Expected: all tests PASS — the new ones plus the 6 prior (counterValue, page render, users 201, users 422, x-laravelize-logged header, /api/protected 403).

- [ ] **Step 5: Run the full suite**

Run: `pnpm exec vitest run`
Expected: 77 tests PASS (65 prior + 7 Gate + 3 defineLaravelizedHandler + 2 integration).

- [ ] **Step 6: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: both green.

- [ ] **Step 7: Run the module build**

Run: `pnpm build`
Expected: `dist/` regenerated without error. (Module consumers depend on `dist/module.mjs` and `dist/types.d.mts` — confirming the build still works catches any auth-export issues that wouldn't surface in unit/integration tests.)

- [ ] **Step 8: Commit**

```bash
git add test/integration/laravelize.test.ts
git commit -m "test(integration): verify Gate-backed authorize end-to-end

POST /api/posts with x-user-role: author succeeds (200); without the header
the request is denied with 403 { message: 'This action is unauthorized.' }.
Full suite at 77 tests."
```

- [ ] **Step 9: Mark task complete**

Use TaskUpdate to mark the F2-D execution task (`#28`) as `completed`.

---

## Done

- F2-D delivered:
  - `Gate` primitive + `InMemoryGate` + `gateToken` + `GateRuleNotDefinedError` in `src/auth/`.
  - `FormRequest.authorize?(event)` hook integrated into `defineLaravelizedHandler` between F2-A middleware and F1 validation.
  - Public exports from `src/http/index.ts` and auto-imports in `src/runtime/server/http/index.ts`.
  - Playground demonstrates the pattern end-to-end via `POST /api/posts` + `x-user-role` header.
- Full suite: 77 tests green.
- ESLint, typecheck, and module build all green.

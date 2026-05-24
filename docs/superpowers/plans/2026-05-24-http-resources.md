# F2-C HTTP Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Laravel-style API Resources (`Resource<T>`, `ResourceCollection<R>`, recursive nesting, auto-serialization in the handler) to `@luckys_luis/nuxt-laravelize`.

**Architecture:** New `src/http/resources/` bounded context with an abstract `Resource<T>` class, a `ResourceCollection<R>` wrapper, an internal `serializeResource` recursive helper, and a single integration point in `defineLaravelizedHandler` that calls `serializeResource(result, event)` at the terminal of the pipeline.

**Tech Stack:** Nuxt 4, Nitro, h3, TypeScript, vitest 4, `@nuxt/test-utils/e2e`, Zod 4 (playground).

---

## File Structure

**Create:**
- `src/http/resources/Resource.ts` — abstract `Resource<T>` + static `collection()`
- `src/http/resources/ResourceCollection.ts` — `ResourceCollection<R>`
- `src/http/resources/serializeResource.ts` — internal recursive helper + `isPlainObject`
- `src/http/resources/isResource.ts` — `isResource` / `isResourceCollection` type guards
- `test/http/resources/Resource.test.ts`
- `test/http/resources/ResourceCollection.test.ts`
- `test/http/resources/serializeResource.test.ts`
- `playground/server/resources/UserResource.ts`
- `playground/server/resources/PostResource.ts`
- `playground/server/api/users/[id].get.ts`
- `playground/server/api/users.get.ts`
- `playground/server/api/posts/[id].get.ts`

**Modify:**
- `src/http/defineLaravelizedHandler.ts` — wrap controller return in `serializeResource(result, event)`
- `src/http/index.ts` — re-export Resource, ResourceCollection, isResource, isResourceCollection
- `src/runtime/server/http/index.ts` — auto-imports for Resource, ResourceCollection
- `playground/server/controllers/userTokens.ts` — extend contract with `find` and `list`
- `playground/server/controllers/UserController.ts` — implement `find` and `list`
- `playground/server/controllers/postsTokens.ts` — extend contract with `find`
- `playground/server/controllers/PostsController.ts` — implement `find` and store an in-memory seed
- `test/http/defineLaravelizedHandler.test.ts` — append 4 tests
- `test/integration/laravelize.test.ts` — append 4 tests

---

## Task 1: `Resource<T>` abstract class

**Files:**
- Create: `src/http/resources/Resource.ts`
- Create: `test/http/resources/Resource.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/http/resources/Resource.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'

interface User {
  id: string
  email: string
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('Resource', () => {
  it('exposes the wrapped resource as a readonly field', () => {
    class UserResource extends Resource<User> {
      override toArray() {
        return { id: this.resource.id, email: this.resource.email }
      }
    }

    const user = { id: 'u-1', email: 'ada@example.com' }
    const subject = new UserResource(user)

    expect(subject.resource).toBe(user)
  })

  it('invokes toArray with the event and returns the expected shape', async () => {
    class UserResource extends Resource<User> {
      override toArray(event: H3Event) {
        expect(event).toBeDefined()
        return { id: this.resource.id }
      }
    }

    const event = createMockEvent()
    const subject = new UserResource({ id: 'u-1', email: 'ada@example.com' })

    const result = await subject.toArray(event)

    expect(result).toEqual({ id: 'u-1' })
  })

  it('supports an async toArray implementation', async () => {
    class UserResource extends Resource<User> {
      override async toArray() {
        await Promise.resolve()
        return { id: this.resource.id }
      }
    }

    const subject = new UserResource({ id: 'u-1', email: 'ada@example.com' })

    const result = await subject.toArray(createMockEvent())

    expect(result).toEqual({ id: 'u-1' })
  })

  it('passes the same event reference to toArray', () => {
    const spy = vi.fn().mockReturnValue({})

    class UserResource extends Resource<User> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }

    const event = createMockEvent()
    new UserResource({ id: 'u-1', email: 'ada@example.com' }).toArray(event)

    expect(spy).toHaveBeenCalledWith(event)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/http/resources/Resource.test.ts`
Expected: FAIL — cannot find module `Resource`

- [ ] **Step 3: Implement `Resource<T>`**

```ts
// src/http/resources/Resource.ts
import type { H3Event } from 'h3'

export abstract class Resource<T> {
  readonly resource: T

  constructor(resource: T) {
    this.resource = resource
  }

  abstract toArray(event: H3Event): Record<string, unknown> | Promise<Record<string, unknown>>
}
```

(Static `collection()` is added in Task 2 to avoid a circular file dependency before `ResourceCollection` exists.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/http/resources/Resource.test.ts`
Expected: 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/http/resources/Resource.ts test/http/resources/Resource.test.ts
git commit -m "feat(resources): add Resource<T> abstract base class

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `ResourceCollection<R>` + `Resource.collection()`

**Files:**
- Create: `src/http/resources/ResourceCollection.ts`
- Modify: `src/http/resources/Resource.ts` (add static `collection()`)
- Create: `test/http/resources/ResourceCollection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/http/resources/ResourceCollection.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'

interface User {
  id: string
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

class UserResource extends Resource<User> {
  override toArray() {
    return { id: this.resource.id }
  }
}

describe('ResourceCollection', () => {
  it('serializes each item using its toArray when toArray is called', async () => {
    const collection = new ResourceCollection([
      new UserResource({ id: 'u-1' }),
      new UserResource({ id: 'u-2' }),
    ])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('passes the same event to every item toArray', async () => {
    const spy = vi.fn().mockReturnValue({})

    class SpyResource extends Resource<User> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }

    const event = createMockEvent()
    const collection = new ResourceCollection([
      new SpyResource({ id: 'u-1' }),
      new SpyResource({ id: 'u-2' }),
    ])

    await collection.toArray(event)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, event)
    expect(spy).toHaveBeenNthCalledWith(2, event)
  })

  it('returns an empty array when the collection has no items', async () => {
    const collection = new ResourceCollection([])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([])
  })

  it('exposes the items as a readonly field', () => {
    const items = [new UserResource({ id: 'u-1' })]
    const collection = new ResourceCollection(items)

    expect(collection.items).toEqual(items)
  })
})

describe('Resource.collection', () => {
  it('builds a ResourceCollection by mapping items through the resource constructor', async () => {
    const collection = UserResource.collection([{ id: 'u-1' }, { id: 'u-2' }])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('returns an empty ResourceCollection when given an empty array', async () => {
    const collection = UserResource.collection([])

    const result = await collection.toArray(createMockEvent())

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/http/resources/ResourceCollection.test.ts`
Expected: FAIL — cannot find module `ResourceCollection` and `UserResource.collection` is not a function

- [ ] **Step 3: Implement `ResourceCollection<R>`**

```ts
// src/http/resources/ResourceCollection.ts
import type { H3Event } from 'h3'

import type { Resource } from './Resource'
import { serializeResource } from './serializeResource'

export class ResourceCollection<R extends Resource<unknown>> {
  readonly items: readonly R[]

  constructor(items: readonly R[]) {
    this.items = items
  }

  async toArray(event: H3Event): Promise<Array<unknown>> {
    return Promise.all(this.items.map(item => serializeResource(item, event)))
  }
}
```

`serializeResource` does not yet exist — we create a minimal stub now so this task compiles. The full implementation lands in Task 3, and Task 3's tests cover the recursion semantics.

```ts
// src/http/resources/serializeResource.ts (minimal stub for now)
import type { H3Event } from 'h3'

import type { Resource } from './Resource'

export async function serializeResource(value: unknown, event: H3Event): Promise<unknown> {
  if (value instanceof (await import('./Resource')).Resource) {
    return (value as Resource<unknown>).toArray(event)
  }
  return value
}
```

> Note: the dynamic `import('./Resource')` avoids a circular reference between `ResourceCollection` ↔ `serializeResource` ↔ `Resource`. Task 3 replaces this stub with the final non-async-import implementation now that all sibling files exist.

- [ ] **Step 4: Add `Resource.collection()` static**

```ts
// src/http/resources/Resource.ts (edited — add static after constructor)
import type { H3Event } from 'h3'

import { ResourceCollection } from './ResourceCollection'

export abstract class Resource<T> {
  readonly resource: T

  constructor(resource: T) {
    this.resource = resource
  }

  abstract toArray(event: H3Event): Record<string, unknown> | Promise<Record<string, unknown>>

  static collection<R extends Resource<unknown>, U>(
    this: new (item: U) => R,
    items: readonly U[],
  ): ResourceCollection<R> {
    return new ResourceCollection(items.map(item => new this(item)))
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run test/http/resources/ResourceCollection.test.ts test/http/resources/Resource.test.ts`
Expected: 10 tests passing total (4 from Task 1 + 6 from Task 2)

- [ ] **Step 6: Commit**

```bash
git add src/http/resources/ResourceCollection.ts src/http/resources/serializeResource.ts src/http/resources/Resource.ts test/http/resources/ResourceCollection.test.ts
git commit -m "feat(resources): add ResourceCollection and Resource.collection() static

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Type guards + final `serializeResource`

**Files:**
- Create: `src/http/resources/isResource.ts`
- Modify: `src/http/resources/serializeResource.ts` (replace stub)
- Create: `test/http/resources/serializeResource.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/http/resources/serializeResource.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it } from 'vitest'

import { Resource } from '../../../src/http/resources/Resource'
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'
import { isResource, isResourceCollection } from '../../../src/http/resources/isResource'
import { serializeResource } from '../../../src/http/resources/serializeResource'

interface User { id: string }

class UserResource extends Resource<User> {
  override toArray() {
    return { id: this.resource.id }
  }
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('isResource / isResourceCollection', () => {
  it('isResource is true for Resource instances and false otherwise', () => {
    expect(isResource(new UserResource({ id: 'u-1' }))).toBe(true)
    expect(isResource({})).toBe(false)
    expect(isResource(null)).toBe(false)
    expect(isResource('x')).toBe(false)
  })

  it('isResourceCollection is true for ResourceCollection instances and false otherwise', () => {
    expect(isResourceCollection(new ResourceCollection([]))).toBe(true)
    expect(isResourceCollection([])).toBe(false)
    expect(isResourceCollection(new UserResource({ id: 'u-1' }))).toBe(false)
  })
})

describe('serializeResource', () => {
  it('serializes a Resource into a plain object', async () => {
    const result = await serializeResource(new UserResource({ id: 'u-1' }), createMockEvent())

    expect(result).toEqual({ id: 'u-1' })
  })

  it('serializes a ResourceCollection into a plain array', async () => {
    const result = await serializeResource(
      new ResourceCollection([new UserResource({ id: 'u-1' }), new UserResource({ id: 'u-2' })]),
      createMockEvent(),
    )

    expect(result).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('recursively serializes a plain object containing Resources', async () => {
    const value = {
      user: new UserResource({ id: 'u-1' }),
      tag: 'static',
    }

    const result = await serializeResource(value, createMockEvent())

    expect(result).toEqual({ user: { id: 'u-1' }, tag: 'static' })
  })

  it('recursively serializes a plain array containing Resources', async () => {
    const value = [new UserResource({ id: 'u-1' }), { static: true }]

    const result = await serializeResource(value, createMockEvent())

    expect(result).toEqual([{ id: 'u-1' }, { static: true }])
  })

  it('resolves a Resource whose toArray returns another Resource recursively', async () => {
    class WrappingResource extends Resource<User> {
      override toArray() {
        return { inner: new UserResource(this.resource) } as unknown as Record<string, unknown>
      }
    }

    const result = await serializeResource(new WrappingResource({ id: 'u-1' }), createMockEvent())

    expect(result).toEqual({ inner: { id: 'u-1' } })
  })

  it('returns primitives, null, and Date untouched', async () => {
    const event = createMockEvent()
    const date = new Date('2026-05-24T00:00:00Z')

    expect(await serializeResource(null, event)).toBe(null)
    expect(await serializeResource(undefined, event)).toBe(undefined)
    expect(await serializeResource(42, event)).toBe(42)
    expect(await serializeResource('hello', event)).toBe('hello')
    expect(await serializeResource(true, event)).toBe(true)
    expect(await serializeResource(date, event)).toBe(date)
  })

  it('serializes a deeply nested mixed structure', async () => {
    const value = {
      meta: { count: 2 },
      users: [
        new UserResource({ id: 'u-1' }),
        { wrapped: new UserResource({ id: 'u-2' }) },
      ],
    }

    const result = await serializeResource(value, createMockEvent())

    expect(result).toEqual({
      meta: { count: 2 },
      users: [{ id: 'u-1' }, { wrapped: { id: 'u-2' } }],
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/http/resources/serializeResource.test.ts`
Expected: FAIL — cannot find `isResource` / `isResourceCollection`; recursion not implemented in the stub.

- [ ] **Step 3: Implement type guards**

```ts
// src/http/resources/isResource.ts
import { Resource } from './Resource'
import { ResourceCollection } from './ResourceCollection'

export function isResource(value: unknown): value is Resource<unknown> {
  return value instanceof Resource
}

export function isResourceCollection(value: unknown): value is ResourceCollection<Resource<unknown>> {
  return value instanceof ResourceCollection
}
```

- [ ] **Step 4: Replace `serializeResource` stub with the final implementation**

```ts
// src/http/resources/serializeResource.ts
import type { H3Event } from 'h3'

import { isResource, isResourceCollection } from './isResource'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export async function serializeResource(value: unknown, event: H3Event): Promise<unknown> {
  if (isResource(value)) {
    const result = await value.toArray(event)
    return serializeResource(result, event)
  }
  if (isResourceCollection(value)) {
    return value.toArray(event)
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(item => serializeResource(item, event)))
  }
  if (isPlainObject(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, v]) => [key, await serializeResource(v, event)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}
```

- [ ] **Step 5: Run all resource tests to verify they pass**

Run: `pnpm exec vitest run test/http/resources/`
Expected: 18 tests passing (4 + 6 + 8)

- [ ] **Step 6: Commit**

```bash
git add src/http/resources/isResource.ts src/http/resources/serializeResource.ts test/http/resources/serializeResource.test.ts
git commit -m "feat(resources): add type guards and recursive serializeResource

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Wire `serializeResource` into `defineLaravelizedHandler`

**Files:**
- Modify: `src/http/defineLaravelizedHandler.ts`
- Modify: `test/http/defineLaravelizedHandler.test.ts` (append 4 tests)

- [ ] **Step 1: Append the failing tests at the end of `test/http/defineLaravelizedHandler.test.ts` (inside the existing `describe`)**

```ts
  it('auto-serializes a Resource returned by the controller', async () => {
    class UserResource extends Resource<{ id: string }> {
      override toArray() {
        return { id: this.resource.id }
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(() => new UserResource({ id: 'u-1' })),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual({ id: 'u-1' })
  })

  it('auto-serializes a ResourceCollection returned by the controller', async () => {
    class UserResource extends Resource<{ id: string }> {
      override toArray() {
        return { id: this.resource.id }
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(() => UserResource.collection([{ id: 'u-1' }, { id: 'u-2' }])),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('returns a plain object untouched when the controller returns no Resource (regression)', async () => {
    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const response = await handler(createMockEvent())

    expect(response).toEqual([{ id: 'u-1' }, { id: 'u-2' }])
  })

  it('passes the H3Event reference into the Resource toArray during auto-serialization', async () => {
    const spy = vi.fn().mockReturnValue({ id: 'u-1' })

    class UserResource extends Resource<{ id: string }> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }

    const controller: UsersController = {
      store: vi.fn(),
      index: vi.fn().mockImplementation(() => new UserResource({ id: 'u-1' })),
    }

    vi.mocked(useContainer).mockReturnValue(createMockContainer(controller))

    const handler = defineLaravelizedHandler({
      controller: usersControllerToken,
      method: 'index',
    })

    const event = createMockEvent()
    await handler(event)

    expect(spy).toHaveBeenCalledWith(event)
  })
```

You will also need to add this import at the top of the test file (next to the other `// eslint-disable-next-line import/first` imports):

```ts
// eslint-disable-next-line import/first
import { Resource } from '../../src/http/resources/Resource'
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm exec vitest run test/http/defineLaravelizedHandler.test.ts`
Expected: the 4 new tests FAIL (handler returns the Resource instance unserialized).

- [ ] **Step 3: Modify `src/http/defineLaravelizedHandler.ts` to call `serializeResource`**

Add the import:

```ts
import { serializeResource } from './resources/serializeResource'
```

Replace the final line of the inner async lambda:

```ts
// before:
return await method.call(controller, input)

// after:
const result = await method.call(controller, input)
return await serializeResource(result, event)
```

The full updated file body of the inner async lambda should read:

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
      const result = await method.call(controller, input)
      return await serializeResource(result, event)
    })
```

- [ ] **Step 4: Run all tests to verify the 4 new ones pass and existing 77 still pass**

Run: `pnpm exec vitest run`
Expected: 99 tests passing (77 prior + 18 from Tasks 1–3 + 4 from Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/http/defineLaravelizedHandler.ts test/http/defineLaravelizedHandler.test.ts
git commit -m "feat(http): auto-serialize Resources returned from controllers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Barrel + auto-imports

**Files:**
- Modify: `src/http/index.ts`
- Modify: `src/runtime/server/http/index.ts`

- [ ] **Step 1: Append Resource exports to `src/http/index.ts`**

Add these lines at the end of the file:

```ts
export { Resource } from './resources/Resource'
export { ResourceCollection } from './resources/ResourceCollection'
export { isResource, isResourceCollection } from './resources/isResource'
```

- [ ] **Step 2: Append Resource and ResourceCollection to the runtime auto-imports**

Edit `src/runtime/server/http/index.ts` to add:

```ts
export { Resource } from '../../../http/resources/Resource'
export { ResourceCollection } from '../../../http/resources/ResourceCollection'
```

The file should now read (full):

```ts
export { FormRequest } from '../../../http/FormRequest'
export { defineLaravelizedHandler } from '../../../http/defineLaravelizedHandler'
export { gateToken } from '../../../auth/GateToken'
export { InMemoryGate } from '../../../auth/Gate'
export { Resource } from '../../../http/resources/Resource'
export { ResourceCollection } from '../../../http/resources/ResourceCollection'
```

- [ ] **Step 3: Verify lint and typecheck are clean**

Run: `pnpm lint && pnpm typecheck`
Expected: zero errors, zero warnings.

- [ ] **Step 4: Run the full unit suite (no regressions)**

Run: `pnpm exec vitest run`
Expected: still 99 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/http/index.ts src/runtime/server/http/index.ts
git commit -m "feat(http): export Resource and ResourceCollection from public surface

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Playground — UserResource (single + collection) + integration tests

**Files:**
- Modify: `playground/server/controllers/userTokens.ts` — extend the contract
- Modify: `playground/server/controllers/UserController.ts` — implement `find` and `list`
- Create: `playground/server/resources/UserResource.ts`
- Create: `playground/server/api/users/[id].get.ts`
- Create: `playground/server/api/users.get.ts`
- Modify: `test/integration/laravelize.test.ts` — append 3 integration tests

- [ ] **Step 1: Create `playground/server/resources/UserResource.ts`** (must exist before controller imports it)

```ts
import type { H3Event } from 'h3'

import { Resource } from '../../../src/http/resources/Resource'

interface User {
  id: string
  email: string
  name: string
}

export class UserResource extends Resource<User> {
  override toArray(event: H3Event): Record<string, unknown> {
    const base: Record<string, unknown> = {
      id: this.resource.id,
      email: this.resource.email,
      name: this.resource.name,
    }
    const role = event.node.req.headers['x-user-role']
    if (role) base.meta = { role }
    return base
  }
}
```

- [ ] **Step 2: Extend `playground/server/controllers/userTokens.ts`** (controller now returns Resources directly)

Replace the file contents with:

```ts
import { createToken } from '../../../src/core/container/Token'
import type { Resource, ResourceCollection } from '../../../src/http'

export interface UsersControllerContract {
  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string }
  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, email: string, name: string }>
  list(input: { body: undefined, query: undefined, params: undefined }): ResourceCollection<Resource<{ id: string, email: string, name: string }>>
}

export const userControllerToken = createToken<UsersControllerContract>('playground.user-controller')
```

- [ ] **Step 3: Implement `find` and `list` in `playground/server/controllers/UserController.ts`**

Replace the file contents with:

```ts
import type { Resource, ResourceCollection } from '../../../src/http'
import { UserResource } from '../resources/UserResource'

import type { UsersControllerContract } from './userTokens'

const SEED = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
] as const

export class UserController implements UsersControllerContract {
  #nextId = 1

  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string } {
    const id = `user-${this.#nextId}`
    this.#nextId += 1
    return { id, email: input.body.email, name: input.body.name }
  }

  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, email: string, name: string }> {
    const found = SEED.find(user => user.id === input.params.id)
    if (!found) throw new Error(`User ${input.params.id} not found`)
    return new UserResource({ ...found })
  }

  list(): ResourceCollection<Resource<{ id: string, email: string, name: string }>> {
    return UserResource.collection(SEED.map(user => ({ ...user })))
  }
}
```

- [ ] **Step 4: Create `playground/server/api/users/[id].get.ts`**

```ts
import { defineLaravelizedHandler } from '../../../../src/http/defineLaravelizedHandler'
import { userControllerToken } from '../../controllers/userTokens'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'find',
})
```

- [ ] **Step 5: Create `playground/server/api/users.get.ts`**

```ts
// playground/server/api/users.get.ts
import { defineLaravelizedHandler } from '../../../src/http/defineLaravelizedHandler'
import { userControllerToken } from '../controllers/userTokens'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'list',
})
```

- [ ] **Step 6: Append 3 integration tests inside the existing `describe` in `test/integration/laravelize.test.ts`**

```ts
  it('returns a single user serialized by UserResource', async () => {
    const response = await $fetch<{ id: string, email: string, name: string, meta?: { role: string } }>('/api/users/user-1')

    expect(response.id).toBe('user-1')
    expect(response.email).toBe('ada@example.com')
    expect(response.name).toBe('Ada Lovelace')
    expect(response.meta).toBeUndefined()
  })

  it('includes meta.role when the x-user-role header is present (event flows to toArray)', async () => {
    const response = await $fetch<{ meta?: { role: string } }>('/api/users/user-1', {
      headers: { 'x-user-role': 'admin' },
    })

    expect(response.meta).toEqual({ role: 'admin' })
  })

  it('returns a collection of users serialized by UserResource.collection', async () => {
    const response = await $fetch<Array<{ id: string, email: string, name: string }>>('/api/users')

    expect(response).toHaveLength(2)
    expect(response[0]).toEqual({ id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' })
    expect(response[1]).toEqual({ id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' })
  })
```

- [ ] **Step 7: Run the integration suite to verify the 3 new tests pass**

Run: `rm -rf .nuxt playground/.nuxt && pnpm dev:prepare && pnpm exec vitest run test/integration/laravelize.test.ts`
Expected: all integration tests pass, including the 3 new ones.

> Note: existing playground POST /api/users uses `store` which still returns a plain object — that test (line 30 of the integration file) still passes because `serializeResource` is identity on plain objects.

- [ ] **Step 8: Run the full suite**

Run: `pnpm exec vitest run`
Expected: 102 tests passing (99 prior + 3 new integration).

- [ ] **Step 9: Commit**

```bash
git add playground/server/controllers/userTokens.ts playground/server/controllers/UserController.ts playground/server/resources/UserResource.ts playground/server/api/users/\[id\].get.ts playground/server/api/users.get.ts test/integration/laravelize.test.ts
git commit -m "feat(playground): add UserResource with single + collection endpoints

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Playground — PostResource (nesting) + final verification

**Files:**
- Modify: `playground/server/controllers/postsTokens.ts` — add `find`
- Modify: `playground/server/controllers/PostsController.ts` — implement `find`, seed a post
- Create: `playground/server/resources/PostResource.ts`
- Create: `playground/server/api/posts/[id].get.ts`
- Modify: `test/integration/laravelize.test.ts` — append 1 nesting test

- [ ] **Step 1: Read `playground/server/controllers/postsTokens.ts` and add a `find` method**

Add to the `PostsControllerContract` interface:

```ts
find(input: { body: undefined, query: undefined, params: { id: string } }): import('../../../src/http').Resource<{ id: string, title: string, content: string, authorId: string }>
```

(Use the explicit `import('...').Resource` form to avoid touching the existing imports — or hoist to a top-level `import type`. Either is fine.)

- [ ] **Step 2: Implement `find` in `playground/server/controllers/PostsController.ts`**

Add a seed array and a `find` method that returns a `new PostResource(post)`. Example shape (adjust to whatever the current file looks like):

```ts
import { PostResource } from '../resources/PostResource'

// ...

const SEED_POSTS = [
  { id: 'post-seed-1', title: 'Hello', content: 'World', authorId: 'user-1' },
] as const

// ...inside the class:
find(input: { body: undefined, query: undefined, params: { id: string } }) {
  const found = SEED_POSTS.find(p => p.id === input.params.id)
  if (!found) throw new Error(`Post ${input.params.id} not found`)
  return new PostResource({ ...found })
}
```

- [ ] **Step 3: Create `playground/server/resources/PostResource.ts`**

```ts
import type { H3Event } from 'h3'

import { Resource } from '../../../src/http/resources/Resource'

import { UserResource } from './UserResource'

interface Post {
  id: string
  title: string
  content: string
  authorId: string
}

const AUTHOR_INDEX: Record<string, { id: string, email: string, name: string } | undefined> = {
  'user-1': { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  'user-2': { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
}

export class PostResource extends Resource<Post> {
  override toArray(_event: H3Event): Record<string, unknown> {
    const author = AUTHOR_INDEX[this.resource.authorId]
    return {
      id: this.resource.id,
      title: this.resource.title,
      content: this.resource.content,
      author: author ? new UserResource(author) : null,
    }
  }
}
```

This exercises nesting: `PostResource.toArray` returns `{ author: new UserResource(...) }`, and `serializeResource` resolves it.

- [ ] **Step 4: Create `playground/server/api/posts/[id].get.ts`**

```ts
import { defineLaravelizedHandler } from '../../../../src/http/defineLaravelizedHandler'
import { postsControllerToken } from '../../controllers/postsTokens'

export default defineLaravelizedHandler({
  controller: postsControllerToken,
  method: 'find',
})
```

- [ ] **Step 5: Append the nesting integration test inside the existing `describe`**

```ts
  it('serializes nested Resources (Post -> author UserResource)', async () => {
    const response = await $fetch<{
      id: string
      title: string
      content: string
      author: { id: string, email: string, name: string }
    }>('/api/posts/post-seed-1')

    expect(response.id).toBe('post-seed-1')
    expect(response.title).toBe('Hello')
    expect(response.author).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    })
  })
```

- [ ] **Step 6: Run the integration suite**

Run: `rm -rf .nuxt playground/.nuxt && pnpm dev:prepare && pnpm exec vitest run test/integration/laravelize.test.ts`
Expected: all integration tests pass including the new nesting test.

- [ ] **Step 7: Run the full suite — final verification**

Run: `pnpm exec vitest run`
Expected: **103 tests passing** (99 prior + 4 new integration in Tasks 6 & 7).

- [ ] **Step 8: Run lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: zero errors.

- [ ] **Step 9: Run build**

Run: `pnpm prepack`
Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add playground/server/controllers/postsTokens.ts playground/server/controllers/PostsController.ts playground/server/resources/PostResource.ts playground/server/api/posts/\[id\].get.ts test/integration/laravelize.test.ts
git commit -m "feat(playground): add PostResource demonstrating nested Resource serialization

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Plan-end self-review checklist

After Task 7, verify against the spec acceptance criteria (§9):

1. ✅ `Resource<T>`, `ResourceCollection<R>`, `isResource`, `isResourceCollection` exported from `src/http/index.ts` — Task 5
2. ✅ `Resource` and `ResourceCollection` auto-importable — Task 5
3. ✅ `toArray` accepts sync and async — Task 1 (test 3)
4. ✅ `Resource.collection(items)` correctly typed — Task 2
5. ✅ Handler auto-serializes Resource/ResourceCollection — Task 4
6. ✅ Nesting resolved recursively — Task 3 (test 5) + Task 7 (integration)
7. ✅ Plain-object controllers unaffected — Task 4 (regression test) + existing 77 tests
8. ✅ Playground working — Tasks 6 & 7
9. ✅ ~28 new tests (actual: 4 + 6 + 8 + 4 + 3 + 1 = **26** — within target band)
10. ✅ Lint, typecheck, build clean — Task 5 (interim) + Task 7 (final)

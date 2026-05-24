# F2-C: HTTP Resources — Design Spec

**Status:** Approved
**Date:** 2026-05-24
**Phase:** F2-C (HTTP Resources)
**Depends on:** F2-A (handler pipeline), F2-D (authorize hook — pipeline ordering preserved)

## 1. Goal

Bring Laravel-style API Resources to `@luckys_luis/nuxt-laravelize`: a thin, type-safe transformation layer that lets controllers return domain models and have them serialized into HTTP-friendly plain objects by a Resource class.

## 2. Scope

**In scope (MVP):**
- `Resource<T>` abstract class with `toArray(event)` (sync or async).
- `ResourceCollection<R>` for arrays of resources.
- `Resource.collection(items)` static helper.
- Nesting: a Resource may return another Resource (or collection) from `toArray`; the handler resolves recursively.
- Auto-serialization in `defineLaravelizedHandler`: if the controller returns a Resource or ResourceCollection (or any structure containing them), the handler serializes before responding.
- Auto-imports for `Resource` and `ResourceCollection` in Nitro server scope.

**Out of scope (deferred, possibly forever):**
- Wrapping with a top-level `data` key (Laravel's default envelope).
- Conditional attributes (`when`, `whenLoaded`, `mergeWhen`).
- Pagination meta / `links`.
- `additional([...])` for extra meta keys.
- Cycle detection in nesting (responsibility of the user).

## 3. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| MVP scope | Minimal: Resource + collection + nesting |
| API shape | Abstract class with public `readonly resource: T` field |
| Handler integration | Auto-serialization — handler detects Resource/Collection and calls `toArray` |
| Async support | `toArray` may return sync `Record` or `Promise<Record>` |
| Collection API | Static `Resource.collection(items)` (Laravel parity) |
| Event in `toArray` | Yes — `toArray(event: H3Event)` |
| Generic typing | `Resource<T>` with `readonly resource: T` |

## 4. Architecture

New bounded context inside the existing HTTP domain:

```
src/http/resources/
├── Resource.ts              # abstract Resource<T> + static collection()
├── ResourceCollection.ts    # wrapper around an array of Resources
├── serializeResource.ts     # internal recursive helper (not exported)
└── isResource.ts            # type guards: isResource, isResourceCollection
```

**Pipeline (terminal of `defineLaravelizedHandler`):**

```
middleware → authorize → validate → controller.method(input) → serializeResource(result, event) → response
```

`serializeResource` is the only new step in the handler. It is a no-op (identity recursion) when no Resource is present, preserving backwards compatibility.

## 5. Components

### 5.1 `Resource<T>`

```ts
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

- `resource` is a public `readonly` field — direct access inside `toArray` without getter boilerplate.
- `toArray` is declared with a union return type to accept sync and async implementations.
- `collection` uses `this`-binding generics so `UserResource.collection(users)` infers `ResourceCollection<UserResource>`.

### 5.2 `ResourceCollection<R>`

```ts
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

- Always async (uses `Promise.all`).
- Items are serialized via `serializeResource` to support nested Resources inside each item's output.

### 5.3 `serializeResource(value, event)`

Internal helper, not exported from `src/http/index.ts`. Used by the handler and by `ResourceCollection.toArray`.

```ts
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

`isPlainObject` returns `true` only for objects whose prototype is `Object.prototype` (excludes `Date`, `Map`, `Set`, class instances). Implemented inline in the same file.

### 5.4 `isResource.ts`

```ts
import { Resource } from './Resource'
import { ResourceCollection } from './ResourceCollection'

export function isResource(value: unknown): value is Resource<unknown> {
  return value instanceof Resource
}

export function isResourceCollection(value: unknown): value is ResourceCollection<Resource<unknown>> {
  return value instanceof ResourceCollection
}
```

### 5.5 Modification to `defineLaravelizedHandler`

Single change at the terminal of the pipeline:

```ts
const result = await controller[method](input)
return await serializeResource(result, event)
```

Backwards compatible: when `result` contains no Resources, `serializeResource` returns a structurally equivalent value (objects and arrays are reconstructed by identity recursion; primitives, Dates, and non-plain objects pass through untouched).

### 5.6 Barrel `src/http/index.ts`

Add re-exports:
- `Resource`
- `ResourceCollection`
- `isResource`
- `isResourceCollection`

`serializeResource` stays internal.

### 5.7 Auto-imports `src/runtime/server/http/index.ts`

Add to the auto-import set:
- `Resource`
- `ResourceCollection`

Type guards and `serializeResource` are not auto-imported.

## 6. Errors and edge cases

| Case | Behavior |
| --- | --- |
| `toArray` throws | Propagates through the handler; h3 converts to 500 (unchanged from controller errors). |
| Resource with circular reference (`toArray` returns `this` or contains itself) | Out of scope. Recursion hangs. User responsibility. |
| `Resource.collection([])` | Returns empty `ResourceCollection` → serializes to `[]`. |
| Controller returns a plain object | Identity recursion. Same shape, same primitives. Zero behavior change. |
| Controller returns `null` / `undefined` / primitive | Returned untouched. |
| Controller returns `Date` | Returned untouched. |
| Controller returns `Map` / `Set` / class instance (non-Resource) | Returned untouched (not a plain object). |
| Resource's `toArray` returns another Resource (e.g. `return new ProfileResource(this.resource.profile)`) | Resolved recursively by `serializeResource`. |

## 7. Backwards compatibility

The 77 existing tests must continue to pass. The single new step (`serializeResource`) is an identity recursion when no Resources are present. Any controller returning plain objects, arrays, primitives, `null`, or `Date` produces an equivalent result.

## 8. Testing strategy

TDD per task. Approximate distribution (~28 new tests):

### `test/http/resources/Resource.test.ts` (~8 tests)
- `toArray` invoked with the event and returns the expected shape
- `this.resource` is accessible with the correct type inside `toArray`
- async `toArray` is awaited
- `Resource.collection(items)` returns a `ResourceCollection`
- `Resource.collection([])` returns an empty `ResourceCollection`

### `test/http/resources/ResourceCollection.test.ts` (~5 tests)
- `toArray(event)` invokes each item's `toArray` with the same event
- Items resolve in parallel
- Empty items → empty array output
- Constructor accepts a readonly array

### `test/http/resources/serializeResource.test.ts` (~7 tests)
- Resource → invokes `toArray` and returns the plain object
- ResourceCollection → invokes `toArray` and returns plain array
- Plain object with nested Resource → recursive resolution
- Plain array with Resources → each serialized
- Resource whose `toArray` returns another Resource → recursive resolution
- Primitives, `null`, `Date` → identity
- Deeply nested mixed structure

### `test/http/defineLaravelizedHandler.test.ts` (~4 new tests)
- Controller returns Resource → response is plain object with `toArray()` applied
- Controller returns ResourceCollection → response is array of plain objects
- Controller returns a plain object (no Resource) → identical behavior (regression)
- The `H3Event` reaches `toArray()` (verified via spy)

### `test/integration/laravelize.test.ts` (~4 new tests, against the playground)
- `GET /api/users/:id` returns a single user serialized by `UserResource`
- `GET /api/users` returns a collection serialized by `UserResource.collection(...)`
- A `meta` attribute appears only when an auth header is present (proves `event` flows to `toArray`)
- Nesting: a `PostResource` with `author: new UserResource(...)` serializes recursively

### Playground (no tests; real usage)
- `playground/server/resources/UserResource.ts` — extends `Resource<User>`, returns `{ id, name, email }` plus a conditional `meta.role` field based on the event headers.
- `playground/server/api/users/[id].get.ts` — returns `new UserResource(user)`.
- `playground/server/api/users.get.ts` — returns `UserResource.collection(users)`.
- Re-uses the existing `UserController` (adds `find(id)` and `list()` methods if missing).
- A `PostResource` and a route exercising nesting (Post → author).

## 9. Acceptance criteria

1. `Resource<T>`, `ResourceCollection<R>`, `isResource`, `isResourceCollection` exported from `src/http/index.ts`.
2. `Resource` and `ResourceCollection` auto-importable in server scope.
3. `toArray(event)` accepts both sync and async implementations.
4. `Resource.collection(items)` returns a `ResourceCollection<R>` with `R` correctly inferred.
5. `defineLaravelizedHandler` auto-serializes any Resource or ResourceCollection returned by the controller (including those nested inside arrays/objects).
6. Nesting of Resources is resolved recursively.
7. Controllers returning plain objects are unaffected (the 77 pre-F2-C tests stay green).
8. Playground includes a working `UserResource` with both single and collection endpoints, plus a nested `PostResource` example.
9. ~28 new tests passing (target total: ~105 green).
10. `pnpm lint`, `pnpm typecheck`, `pnpm prepack` are clean.

## 10. Out-of-scope (for a future spec)

- `data` wrapping (toggleable envelope).
- Conditional attribute helpers.
- Pagination meta.
- `additional()` meta merging.
- Cycle detection.

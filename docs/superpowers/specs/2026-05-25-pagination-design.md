# F5: Pagination — Design Spec

**Status:** Approved
**Date:** 2026-05-25
**Phase:** F5 (Pagination)
**Depends on:** F2-C (HTTP Resources)

## 1. Goal

Add Laravel-style pagination to `@luckys_luis/nuxt-laravelize`: three paginator types (`LengthAwarePaginator`, `SimplePaginator`, `CursorPaginator`) and a `PaginatedResourceCollection` that integrates with F2-C Resources to emit Laravel-compatible `{data, links, meta}` responses. DB-agnostic: the user supplies items + count (or cursor keys) and the module shapes the HTTP response.

## 2. Scope

**In scope (MVP):**
- `LengthAwarePaginator` — knows `total` and `last_page`.
- `SimplePaginator` — `hasMore` only, no count.
- `CursorPaginator` — base64url cursor encoding.
- `PaginatedResourceCollection<R>` — wraps a paginator + a Resource ctor, emits `{data, links, meta}` on `toArray(event)`.
- `Resource.collection()` overloaded: array → `ResourceCollection` (existing); `Paginator` → `PaginatedResourceCollection` (new).
- `serializeResource` auto-detects `PaginatedResourceCollection` in the handler.
- `fromRequest(event, items, ...)` static helpers on each paginator.
- `parsePageParams(event, options?)` / `parseCursorParams(event, options?)` helpers.
- `encodeCursor` / `decodeCursor` helpers.
- URL building via h3's `getRequestURL` (respects `X-Forwarded-*`).

**Out of scope (deferred):**
- ORM adapters (Drizzle, Prisma, etc.).
- Pagination middleware / link headers (`Link` HTTP header).
- Async iteration helpers (`.chunk()`, `.each()`).
- Custom envelope override (Laravel-shape only in MVP).
- `Paginator.through()` transformer.
- Pagination resource collection serialization at controller-construction time (we only serialize at handler-response time).

## 3. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Paginator types | All three: LengthAware + Simple + Cursor |
| Construction | DB-agnostic: user passes items + count/hasMore/cursor keys |
| Request extraction | Static `Paginator.fromRequest(event, items, ...)` |
| Resource integration | Overload `Resource.collection()` to detect paginator; new `PaginatedResourceCollection` |
| Response shape | Laravel exact: `{data, links, meta}` |
| URL building | Derive from H3Event via `getRequestURL` (respects proxies) |
| Cursor encoding | Base64url JSON of `{key, direction}` |

## 4. Architecture

New bounded context:

```
src/pagination/
├── Paginator.ts                       # Paginator<T> interface + shared types
├── LengthAwarePaginator.ts            # total + last_page
├── SimplePaginator.ts                 # hasMore only
├── CursorPaginator.ts                 # base64url cursor + encode/decode
├── PaginatedResourceCollection.ts     # paginator + Resource ctor → {data, links, meta}
├── isPaginator.ts                     # type guards
├── urls.ts                            # buildPageUrl, buildCursorUrl, getRequestPath
├── extractParams.ts                   # parsePageParams, parseCursorParams
└── index.ts                           # barrel
```

**Cross-cutting changes:**

- `src/http/resources/Resource.ts` — overload `static collection()` to accept array OR `Paginator`.
- `src/http/resources/serializeResource.ts` — add `isPaginatedResourceCollection` branch before array/object branches.
- `src/http/index.ts` — re-export pagination public surface.
- `src/runtime/server/pagination/index.ts` — auto-imports for the three paginator classes.
- `src/module.ts` — `addServerImportsDir('./runtime/server/pagination')`.

**Runtime flow:**

```
HTTP GET /api/users?page=2&per_page=15
  → controller.list():
        const { page, perPage } = parsePageParams(event)
        const items = await db.select(...).offset((page-1)*perPage).limit(perPage)
        const total = await db.count(...)
        const paginator = new LengthAwarePaginator(items, total, perPage, page)
        return UserResource.collection(paginator)
  → handler.serializeResource(result, event):
        detects PaginatedResourceCollection → await pc.toArray(event)
        pc.toArray serializes each item with UserResource + adds meta + links derived from event
  → response: {data, links: {first, last, prev, next}, meta: {current_page, from, last_page, path, per_page, to, total}}
```

**No new external dependencies.** Base64 via `Buffer.from(...).toString('base64url')` (Node built-in). URL parsing via h3's `getRequestURL`.

## 5. Components

### 5.1 `Paginator.ts`

```ts
import type { H3Event } from 'h3'

export interface Paginator<T> {
  readonly items: readonly T[]
  toMeta(event: H3Event): Record<string, unknown>
  toLinks(event: H3Event): Record<string, string | null>
}

export interface ParsePageParamsOptions {
  defaultPerPage?: number
  maxPerPage?: number
}

export interface PageParams {
  page: number
  perPage: number
}

export interface CursorParams {
  cursor: string | null
  perPage: number
}
```

Defaults: `defaultPerPage = 15`, `maxPerPage = 100`.

### 5.2 `LengthAwarePaginator.ts`

```ts
import type { H3Event } from 'h3'

import type { Paginator, ParsePageParamsOptions } from './Paginator'
import { parsePageParams } from './extractParams'
import { buildPageUrl, getRequestPath } from './urls'

export class LengthAwarePaginator<T> implements Paginator<T> {
  readonly items: readonly T[]
  readonly total: number
  readonly perPage: number
  readonly currentPage: number

  constructor(items: readonly T[], total: number, perPage: number, currentPage: number) {
    this.items = items
    this.total = Math.max(total, 0)
    this.perPage = Math.max(perPage, 1)
    this.currentPage = Math.max(currentPage, 1)
  }

  static fromRequest<T>(
    event: H3Event,
    items: readonly T[],
    total: number,
    options?: ParsePageParamsOptions,
  ): LengthAwarePaginator<T> {
    const { page, perPage } = parsePageParams(event, options)
    return new LengthAwarePaginator(items, total, perPage, page)
  }

  get lastPage(): number {
    return Math.max(Math.ceil(this.total / this.perPage), 1)
  }

  get from(): number | null {
    if (this.items.length === 0) return null
    return (this.currentPage - 1) * this.perPage + 1
  }

  get to(): number | null {
    if (this.items.length === 0) return null
    return ((this.currentPage - 1) * this.perPage) + this.items.length
  }

  toMeta(event: H3Event): Record<string, unknown> {
    return {
      current_page: this.currentPage,
      from: this.from,
      last_page: this.lastPage,
      path: getRequestPath(event),
      per_page: this.perPage,
      to: this.to,
      total: this.total,
    }
  }

  toLinks(event: H3Event): Record<string, string | null> {
    return {
      first: buildPageUrl(event, 1, this.perPage),
      last: buildPageUrl(event, this.lastPage, this.perPage),
      prev: this.currentPage > 1 ? buildPageUrl(event, this.currentPage - 1, this.perPage) : null,
      next: this.currentPage < this.lastPage ? buildPageUrl(event, this.currentPage + 1, this.perPage) : null,
    }
  }
}
```

### 5.3 `SimplePaginator.ts`

```ts
import type { H3Event } from 'h3'

import type { Paginator, ParsePageParamsOptions } from './Paginator'
import { parsePageParams } from './extractParams'
import { buildPageUrl, getRequestPath } from './urls'

export class SimplePaginator<T> implements Paginator<T> {
  readonly items: readonly T[]
  readonly perPage: number
  readonly currentPage: number
  readonly hasMore: boolean

  constructor(items: readonly T[], perPage: number, currentPage: number, hasMore: boolean) {
    this.items = items
    this.perPage = Math.max(perPage, 1)
    this.currentPage = Math.max(currentPage, 1)
    this.hasMore = hasMore
  }

  static fromRequest<T>(
    event: H3Event,
    items: readonly T[],
    hasMore: boolean,
    options?: ParsePageParamsOptions,
  ): SimplePaginator<T> {
    const { page, perPage } = parsePageParams(event, options)
    return new SimplePaginator(items, perPage, page, hasMore)
  }

  toMeta(event: H3Event): Record<string, unknown> {
    const base = (this.currentPage - 1) * this.perPage
    return {
      current_page: this.currentPage,
      from: this.items.length > 0 ? base + 1 : null,
      path: getRequestPath(event),
      per_page: this.perPage,
      to: this.items.length > 0 ? base + this.items.length : null,
    }
  }

  toLinks(event: H3Event): Record<string, string | null> {
    return {
      prev: this.currentPage > 1 ? buildPageUrl(event, this.currentPage - 1, this.perPage) : null,
      next: this.hasMore ? buildPageUrl(event, this.currentPage + 1, this.perPage) : null,
    }
  }
}
```

### 5.4 `CursorPaginator.ts`

```ts
import type { H3Event } from 'h3'

import type { Paginator, ParsePageParamsOptions } from './Paginator'
import { parseCursorParams } from './extractParams'
import { buildCursorUrl, getRequestPath } from './urls'

interface CursorPayload {
  key: string
  direction: 'next' | 'prev'
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodeCursor(cursor: string): CursorPayload {
  const json = Buffer.from(cursor, 'base64url').toString('utf-8')
  return JSON.parse(json) as CursorPayload
}

export class CursorPaginator<T> implements Paginator<T> {
  readonly items: readonly T[]
  readonly perPage: number
  readonly nextCursor: string | null
  readonly prevCursor: string | null

  constructor(
    items: readonly T[],
    perPage: number,
    nextCursor: string | null,
    prevCursor: string | null,
  ) {
    this.items = items
    this.perPage = Math.max(perPage, 1)
    this.nextCursor = nextCursor
    this.prevCursor = prevCursor
  }

  static fromRequest<T>(
    event: H3Event,
    items: readonly T[],
    nextCursorKey: string | null,
    prevCursorKey: string | null,
    options?: ParsePageParamsOptions,
  ): CursorPaginator<T> {
    const { perPage } = parseCursorParams(event, options)
    return new CursorPaginator(
      items,
      perPage,
      nextCursorKey ? encodeCursor({ key: nextCursorKey, direction: 'next' }) : null,
      prevCursorKey ? encodeCursor({ key: prevCursorKey, direction: 'prev' }) : null,
    )
  }

  toMeta(event: H3Event): Record<string, unknown> {
    return {
      path: getRequestPath(event),
      per_page: this.perPage,
      next_cursor: this.nextCursor,
      prev_cursor: this.prevCursor,
    }
  }

  toLinks(event: H3Event): Record<string, string | null> {
    return {
      prev: this.prevCursor ? buildCursorUrl(event, this.prevCursor, this.perPage) : null,
      next: this.nextCursor ? buildCursorUrl(event, this.nextCursor, this.perPage) : null,
    }
  }
}
```

### 5.5 `extractParams.ts`

```ts
import type { H3Event } from 'h3'
import { getQuery } from 'h3'

import type { CursorParams, PageParams, ParsePageParamsOptions } from './Paginator'

const DEFAULT_PER_PAGE = 15
const DEFAULT_MAX_PER_PAGE = 100

function toFinitePositive(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(n, 1)
}

export function parsePageParams(event: H3Event, options?: ParsePageParamsOptions): PageParams {
  const query = getQuery(event)
  const page = toFinitePositive(query.page, 1)
  const requested = toFinitePositive(query.per_page, options?.defaultPerPage ?? DEFAULT_PER_PAGE)
  const cap = options?.maxPerPage ?? DEFAULT_MAX_PER_PAGE
  const perPage = Math.min(requested, cap)
  return { page, perPage }
}

export function parseCursorParams(event: H3Event, options?: ParsePageParamsOptions): CursorParams {
  const query = getQuery(event)
  const raw = query.cursor
  const cursor = typeof raw === 'string' && raw.length > 0 ? raw : null
  const requested = toFinitePositive(query.per_page, options?.defaultPerPage ?? DEFAULT_PER_PAGE)
  const cap = options?.maxPerPage ?? DEFAULT_MAX_PER_PAGE
  const perPage = Math.min(requested, cap)
  return { cursor, perPage }
}
```

`toFinitePositive` handles `NaN`, negative, and zero inputs by falling back.

### 5.6 `urls.ts`

```ts
import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

export function getRequestPath(event: H3Event): string {
  const url = getRequestURL(event)
  return `${url.origin}${url.pathname}`
}

export function buildPageUrl(event: H3Event, page: number, perPage: number): string {
  const url = getRequestURL(event)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))
  return url.toString()
}

export function buildCursorUrl(event: H3Event, cursor: string, perPage: number): string {
  const url = getRequestURL(event)
  url.searchParams.delete('page')
  url.searchParams.set('cursor', cursor)
  url.searchParams.set('per_page', String(perPage))
  return url.toString()
}
```

### 5.7 `PaginatedResourceCollection.ts`

```ts
import type { H3Event } from 'h3'

import type { Resource } from '../http/resources/Resource'
import { serializeResource } from '../http/resources/serializeResource'

import type { Paginator } from './Paginator'

export class PaginatedResourceCollection<R extends Resource<unknown>> {
  readonly paginator: Paginator<unknown>
  readonly resourceCtor: new (item: unknown) => R

  constructor(paginator: Paginator<unknown>, resourceCtor: new (item: unknown) => R) {
    this.paginator = paginator
    this.resourceCtor = resourceCtor
  }

  async toArray(event: H3Event): Promise<{
    data: Array<unknown>
    links: Record<string, string | null>
    meta: Record<string, unknown>
  }> {
    const data = await Promise.all(
      this.paginator.items.map(item =>
        serializeResource(new this.resourceCtor(item), event),
      ),
    )
    return {
      data,
      links: this.paginator.toLinks(event),
      meta: this.paginator.toMeta(event),
    }
  }
}
```

### 5.8 `isPaginator.ts`

```ts
import type { Resource } from '../http/resources/Resource'

import { CursorPaginator } from './CursorPaginator'
import { LengthAwarePaginator } from './LengthAwarePaginator'
import type { Paginator } from './Paginator'
import { PaginatedResourceCollection } from './PaginatedResourceCollection'
import { SimplePaginator } from './SimplePaginator'

export function isPaginator(value: unknown): value is Paginator<unknown> {
  return value instanceof LengthAwarePaginator
    || value instanceof SimplePaginator
    || value instanceof CursorPaginator
}

export function isPaginatedResourceCollection(value: unknown): value is PaginatedResourceCollection<Resource<unknown>> {
  return value instanceof PaginatedResourceCollection
}
```

### 5.9 Modification to `src/http/resources/Resource.ts`

Overload `static collection()`:

```ts
import type { Paginator } from '../../pagination/Paginator'
import { isPaginator } from '../../pagination/isPaginator'
import { PaginatedResourceCollection } from '../../pagination/PaginatedResourceCollection'

// ... inside Resource class:
static collection<R extends Resource<U>, U>(
  this: new (item: U) => R,
  items: readonly U[],
): ResourceCollection<R>
static collection<R extends Resource<U>, U>(
  this: new (item: U) => R,
  items: Paginator<U>,
): PaginatedResourceCollection<R>
static collection<R extends Resource<U>, U>(
  this: new (item: U) => R,
  items: readonly U[] | Paginator<U>,
): ResourceCollection<R> | PaginatedResourceCollection<R> {
  if (isPaginator(items)) {
    return new PaginatedResourceCollection(items, this as unknown as new (item: unknown) => R)
  }
  return new ResourceCollection(items.map(item => new this(item)))
}
```

Two overload signatures + one implementation signature. Callers get accurate return types.

### 5.10 Modification to `src/http/resources/serializeResource.ts`

Add a new branch BEFORE the array/plain-object branches (after the Resource/ResourceCollection branches):

```ts
import { isPaginatedResourceCollection } from '../../pagination/isPaginator'

// ... inside serializeResource:
if (isPaginatedResourceCollection(value)) {
  return value.toArray(event)
}
```

### 5.11 Barrel `src/pagination/index.ts`

```ts
export type { Paginator, ParsePageParamsOptions, PageParams, CursorParams } from './Paginator'
export { LengthAwarePaginator } from './LengthAwarePaginator'
export { SimplePaginator } from './SimplePaginator'
export { CursorPaginator, encodeCursor, decodeCursor } from './CursorPaginator'
export { PaginatedResourceCollection } from './PaginatedResourceCollection'
export { isPaginator, isPaginatedResourceCollection } from './isPaginator'
export { parsePageParams, parseCursorParams } from './extractParams'
export { buildPageUrl, buildCursorUrl, getRequestPath } from './urls'
```

### 5.12 Auto-imports `src/runtime/server/pagination/index.ts`

```ts
export { LengthAwarePaginator } from '../../../pagination/LengthAwarePaginator'
export { SimplePaginator } from '../../../pagination/SimplePaginator'
export { CursorPaginator } from '../../../pagination/CursorPaginator'
```

Helpers (`parsePageParams`, `decodeCursor`, etc.) stay as explicit imports — keeps the auto-import set focused on the most-used classes.

### 5.13 Module wiring (`src/module.ts`)

Add at the end of `setup`:
```ts
addServerImportsDir(resolver.resolve('./runtime/server/pagination'))
```

### 5.14 Re-exports from `src/http/index.ts`

Add:
```ts
export { LengthAwarePaginator, SimplePaginator, CursorPaginator, PaginatedResourceCollection, encodeCursor, decodeCursor, parsePageParams, parseCursorParams, isPaginator, isPaginatedResourceCollection } from '../pagination'
export type { Paginator, ParsePageParamsOptions, PageParams, CursorParams } from '../pagination'
```

(Pagination is conceptually part of the HTTP response surface — consumers import it alongside Resources from the same place.)

## 6. Errors and edge cases

| Case | Behavior |
| --- | --- |
| `LengthAwarePaginator` with `total=0` | `lastPage=1`, `from=null`, `to=null`, `data: []`. Links: `first`/`last` point to page 1; `prev`/`next` = `null`. |
| `currentPage > lastPage` | User responsibility to validate. Paginator computes shape with the given page; `next=null`. |
| `perPage <= 0` / `currentPage <= 0` | Clamped to 1 in the constructor. |
| `SimplePaginator.hasMore` | User-supplied. Common pattern: fetch `perPage+1` items, set `hasMore = items.length > perPage`, slice before passing. |
| `CursorPaginator` with malformed cursor | `decodeCursor` propagates `SyntaxError`. User should try/catch or validate. |
| `CursorPaginator` with both cursors null | Single-page result; `next`/`prev` links both `null`. |
| `parsePageParams` with non-numeric `page` (e.g., `abc`) | Falls back to 1 via `toFinitePositive`. |
| `parsePageParams` with `per_page=999` and `maxPerPage=100` | Clamped to 100. |
| `PaginatedResourceCollection` with empty items | `data: []`, meta with `from/to=null`, prev/next links null, first/last point to page 1 (LengthAware). |
| Nested Resources inside paginator items | Handled by `serializeResource` recursion. |
| URL building when path already has `?page=` | `URLSearchParams.set` replaces; no duplication. |
| `getRequestURL` behind reverse proxy | h3 respects `X-Forwarded-Proto` / `X-Forwarded-Host`. |
| Handler auto-serialization | `serializeResource` detects `PaginatedResourceCollection` via the new branch and returns `{data, links, meta}`. |
| Controller returns `{users: paginator}` (nested) | Recursion via `serializeResource` handles it; result is `{users: {data, links, meta}}`. |

## 7. Backward compatibility

- `UserResource.collection(array)` returns `ResourceCollection` (unchanged path).
- `UserResource.collection(paginator)` returns `PaginatedResourceCollection` (new path).
- `serializeResource` gains ONE branch before existing ones — no regression for non-paginated cases.
- All 26 F2-C Resources tests stay green. All F2-C integration tests stay green.

## 8. Testing strategy

TDD per task. Target: ~60 new tests.

### Unit (~52)
- `test/pagination/LengthAwarePaginator.test.ts` (~10)
- `test/pagination/SimplePaginator.test.ts` (~6)
- `test/pagination/CursorPaginator.test.ts` (~10)
- `test/pagination/extractParams.test.ts` (~10)
- `test/pagination/urls.test.ts` (~6)
- `test/pagination/PaginatedResourceCollection.test.ts` (~8)
- `test/http/resources/Resource.test.ts` (~3 new)
- `test/http/resources/serializeResource.test.ts` (~2 new)

### Integration (~5)
- `test/integration/laravelize.test.ts` — appended 5 new tests covering Laravel-shape responses and the three paginator types.

### Playground
- Modify `UserController.list()` to return a `LengthAwarePaginator` over an expanded SEED (10–20 users).
- New endpoint `/api/users/cursor` returning `CursorPaginator`.
- New endpoint `/api/users/simple` returning `SimplePaginator`.

## 9. Acceptance criteria

1. All public surface exported from `src/pagination/index.ts` and re-exported from `src/http/index.ts`.
2. `LengthAwarePaginator`, `SimplePaginator`, `CursorPaginator` auto-importable in server scope.
3. `Paginator.fromRequest` operative + extracts `?page` / `?per_page` / `?cursor` with `maxPerPage` cap.
4. Response shape Laravel-exact: `{data, links: {first, last, prev, next}, meta: {current_page, from, last_page, path, per_page, to, total}}` for `LengthAwarePaginator`.
5. `SimplePaginator` and `CursorPaginator` emit appropriate meta/links shape.
6. `CursorPaginator` cursor encode/decode with base64url.
7. URLs built via `getRequestURL` respect reverse proxies.
8. `Resource.collection(paginator)` auto-detects and returns `PaginatedResourceCollection`; `Resource.collection(array)` still returns `ResourceCollection` (backward compat).
9. Handler auto-serializes `PaginatedResourceCollection` via `serializeResource`.
10. All 26 F2-C tests + integration tests stay green.
11. ~60 new tests passing (target total ~265).
12. Playground demo with three endpoints (length-aware, simple, cursor).
13. `pnpm lint`, `pnpm typecheck`, `pnpm prepack` clean.

## 10. Out-of-scope (for a future spec)

- ORM adapters (Drizzle, Prisma, Knex).
- `Link` HTTP header instead of body links.
- Pagination middleware that transforms responses globally.
- Async chunk / each iterators.
- Custom envelope override (replace `data` with another key, omit `meta`, etc.).
- Cursor sorting validation (the user is responsible for stable sort order).

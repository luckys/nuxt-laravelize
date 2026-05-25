# F5 Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Laravel-style pagination (`LengthAwarePaginator`, `SimplePaginator`, `CursorPaginator` + `PaginatedResourceCollection`) that integrates with F2-C Resources to emit Laravel-shape `{data, links, meta}` responses.

**Architecture:** New `src/pagination/` bounded context. DB-agnostic — the user supplies items + count/hasMore/cursor keys; the module shapes the HTTP response. `Resource.collection()` overloaded to detect a paginator and return `PaginatedResourceCollection`. `serializeResource` gets one new branch for auto-serialization in the handler.

**Tech Stack:** TypeScript, vitest 4, h3's `getQuery` / `getRequestURL`, Node `Buffer` for base64url.

---

## File Structure

**Create (source):**
- `src/pagination/Paginator.ts`
- `src/pagination/extractParams.ts`
- `src/pagination/urls.ts`
- `src/pagination/LengthAwarePaginator.ts`
- `src/pagination/SimplePaginator.ts`
- `src/pagination/CursorPaginator.ts`
- `src/pagination/PaginatedResourceCollection.ts`
- `src/pagination/isPaginator.ts`
- `src/pagination/index.ts`
- `src/runtime/server/pagination/index.ts`

**Create (tests):**
- `test/pagination/extractParams.test.ts`
- `test/pagination/urls.test.ts`
- `test/pagination/LengthAwarePaginator.test.ts`
- `test/pagination/SimplePaginator.test.ts`
- `test/pagination/CursorPaginator.test.ts`
- `test/pagination/PaginatedResourceCollection.test.ts`

**Modify (source):**
- `src/http/resources/Resource.ts` — overload `static collection()`
- `src/http/resources/serializeResource.ts` — add `isPaginatedResourceCollection` branch
- `src/http/index.ts` — re-export pagination surface
- `src/module.ts` — add `addServerImportsDir('./runtime/server/pagination')`

**Modify (tests):**
- `test/http/resources/Resource.test.ts` — append 3 tests for overload
- `test/http/resources/serializeResource.test.ts` — append 2 tests for paginator branch
- `test/integration/laravelize.test.ts` — append 5 integration tests

**Modify (playground):**
- `playground/server/controllers/UserController.ts` — extend SEED + change `list()` to return `LengthAwarePaginator`
- `playground/server/controllers/userTokens.ts` — update `list` contract type
- `playground/server/api/users.get.ts` — no change (handler config stays)
- `playground/server/api/users-simple.get.ts` (new)
- `playground/server/api/users-cursor.get.ts` (new)

---

## Task 1: `Paginator` interface + shared types

**Files:**
- Create: `src/pagination/Paginator.ts`

This task creates the type-only file at the foundation. No tests (the interface is exercised by the concrete paginators in later tasks).

- [ ] **Step 1: Create `src/pagination/Paginator.ts`**

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

- [ ] **Step 2: Verify lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pagination/Paginator.ts
git commit -m "feat(pagination): add Paginator interface and shared types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `extractParams` (parsePageParams + parseCursorParams) + tests

**Files:**
- Create: `src/pagination/extractParams.ts`
- Create: `test/pagination/extractParams.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/pagination/extractParams.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { parseCursorParams, parsePageParams } from '../../src/pagination/extractParams'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('parsePageParams', () => {
  it('returns defaults when query is empty (page=1, perPage=15)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 15 })
  })

  it('parses ?page=3', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: '3' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 3, perPage: 15 })
  })

  it('parses ?per_page=25', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '25' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 25 })
  })

  it('clamps per_page to the maxPerPage cap (default 100)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '999' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 100 })
  })

  it('clamps per_page to 1 when 0 or negative', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '0' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 1 })

    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '-5' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 1 })
  })

  it('falls back to page=1 when ?page=abc (non-numeric)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: 'abc' })
    expect(parsePageParams(createMockEvent())).toEqual({ page: 1, perPage: 15 })
  })

  it('respects options.defaultPerPage', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    expect(parsePageParams(createMockEvent(), { defaultPerPage: 50 })).toEqual({ page: 1, perPage: 50 })
  })

  it('respects options.maxPerPage', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ per_page: '500' })
    expect(parsePageParams(createMockEvent(), { maxPerPage: 200 })).toEqual({ page: 1, perPage: 200 })
  })
})

describe('parseCursorParams', () => {
  it('returns defaults when query is empty (cursor=null, perPage=15)', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    expect(parseCursorParams(createMockEvent())).toEqual({ cursor: null, perPage: 15 })
  })

  it('parses ?cursor=abc123', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ cursor: 'abc123' })
    expect(parseCursorParams(createMockEvent())).toEqual({ cursor: 'abc123', perPage: 15 })
  })

  it('treats empty string cursor as null', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ cursor: '' })
    expect(parseCursorParams(createMockEvent())).toEqual({ cursor: null, perPage: 15 })
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm exec vitest run test/pagination/extractParams.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pagination/extractParams.ts`**

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

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run test/pagination/extractParams.test.ts`
Expected: 11 tests passing.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pagination/extractParams.ts test/pagination/extractParams.test.ts
git commit -m "feat(pagination): add parsePageParams and parseCursorParams helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: `urls` helpers + tests

**Files:**
- Create: `src/pagination/urls.ts`
- Create: `test/pagination/urls.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/pagination/urls.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { buildCursorUrl, buildPageUrl, getRequestPath } from '../../src/pagination/urls'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('getRequestPath', () => {
  it('returns origin + pathname (no query)', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=2'))
    expect(getRequestPath(createMockEvent())).toBe('https://api.example.com/users')
  })
})

describe('buildPageUrl', () => {
  it('appends ?page= and ?per_page= when query is empty', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    expect(buildPageUrl(createMockEvent(), 2, 15))
      .toBe('https://api.example.com/users?page=2&per_page=15')
  })

  it('replaces existing ?page= rather than duplicating', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=1&per_page=10'))
    expect(buildPageUrl(createMockEvent(), 5, 20))
      .toBe('https://api.example.com/users?page=5&per_page=20')
  })

  it('preserves unrelated query params', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?filter=active'))
    expect(buildPageUrl(createMockEvent(), 3, 15))
      .toBe('https://api.example.com/users?filter=active&page=3&per_page=15')
  })
})

describe('buildCursorUrl', () => {
  it('appends ?cursor= and ?per_page= when query is empty', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    expect(buildCursorUrl(createMockEvent(), 'abc123', 15))
      .toBe('https://api.example.com/users?cursor=abc123&per_page=15')
  })

  it('replaces existing ?cursor= and drops ?page=', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=2&cursor=old'))
    expect(buildCursorUrl(createMockEvent(), 'new', 25))
      .toBe('https://api.example.com/users?cursor=new&per_page=25')
  })

  it('preserves unrelated query params', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?filter=active'))
    expect(buildCursorUrl(createMockEvent(), 'xyz', 15))
      .toBe('https://api.example.com/users?filter=active&cursor=xyz&per_page=15')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm exec vitest run test/pagination/urls.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pagination/urls.ts`**

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

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run test/pagination/urls.test.ts`
Expected: 7 tests passing.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pagination/urls.ts test/pagination/urls.test.ts
git commit -m "feat(pagination): add buildPageUrl, buildCursorUrl, getRequestPath helpers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: `LengthAwarePaginator` + tests

**Files:**
- Create: `src/pagination/LengthAwarePaginator.ts`
- Create: `test/pagination/LengthAwarePaginator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/pagination/LengthAwarePaginator.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { LengthAwarePaginator } from '../../src/pagination/LengthAwarePaginator'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('LengthAwarePaginator', () => {
  it('constructs with items + total + perPage + currentPage', () => {
    const p = new LengthAwarePaginator(['a', 'b', 'c'], 25, 5, 2)
    expect(p.items).toEqual(['a', 'b', 'c'])
    expect(p.total).toBe(25)
    expect(p.perPage).toBe(5)
    expect(p.currentPage).toBe(2)
  })

  it('lastPage is ceil(total / perPage)', () => {
    expect(new LengthAwarePaginator([], 25, 5, 1).lastPage).toBe(5)
    expect(new LengthAwarePaginator([], 27, 5, 1).lastPage).toBe(6)
  })

  it('lastPage is at least 1 even when total is 0', () => {
    expect(new LengthAwarePaginator([], 0, 5, 1).lastPage).toBe(1)
  })

  it('from is (currentPage - 1) * perPage + 1', () => {
    expect(new LengthAwarePaginator(['x', 'y'], 25, 5, 3).from).toBe(11)
  })

  it('to is from + items.length - 1', () => {
    expect(new LengthAwarePaginator(['x', 'y'], 25, 5, 3).to).toBe(12)
  })

  it('from and to are null when items is empty', () => {
    const p = new LengthAwarePaginator([], 25, 5, 1)
    expect(p.from).toBe(null)
    expect(p.to).toBe(null)
  })

  it('clamps perPage and currentPage to at least 1', () => {
    const p = new LengthAwarePaginator([], 25, 0, 0)
    expect(p.perPage).toBe(1)
    expect(p.currentPage).toBe(1)
  })

  it('toMeta returns Laravel-shape (current_page, from, last_page, path, per_page, to, total)', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users?page=2'))
    const p = new LengthAwarePaginator(['x', 'y', 'z'], 25, 5, 2)
    expect(p.toMeta(createMockEvent())).toEqual({
      current_page: 2,
      from: 6,
      last_page: 5,
      path: 'https://api.example.com/users',
      per_page: 5,
      to: 8,
      total: 25,
    })
  })

  it('toLinks returns first/last/prev/next URLs with correct page numbers', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new LengthAwarePaginator(['x'], 25, 5, 3)
    expect(p.toLinks(createMockEvent())).toEqual({
      first: 'https://api.example.com/users?page=1&per_page=5',
      last: 'https://api.example.com/users?page=5&per_page=5',
      prev: 'https://api.example.com/users?page=2&per_page=5',
      next: 'https://api.example.com/users?page=4&per_page=5',
    })
  })

  it('prev is null when currentPage is 1', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new LengthAwarePaginator(['x'], 25, 5, 1)
    expect(p.toLinks(createMockEvent()).prev).toBe(null)
  })

  it('next is null when currentPage equals lastPage', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new LengthAwarePaginator(['x'], 25, 5, 5)
    expect(p.toLinks(createMockEvent()).next).toBe(null)
  })

  it('fromRequest parses ?page and ?per_page from the event', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: '3', per_page: '10' })
    const p = LengthAwarePaginator.fromRequest(createMockEvent(), ['x', 'y'], 25)
    expect(p.currentPage).toBe(3)
    expect(p.perPage).toBe(10)
    expect(p.items).toEqual(['x', 'y'])
    expect(p.total).toBe(25)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm exec vitest run test/pagination/LengthAwarePaginator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pagination/LengthAwarePaginator.ts`**

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

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run test/pagination/LengthAwarePaginator.test.ts`
Expected: 12 tests passing.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pagination/LengthAwarePaginator.ts test/pagination/LengthAwarePaginator.test.ts
git commit -m "feat(pagination): add LengthAwarePaginator with Laravel-shape meta/links

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: `SimplePaginator` + tests

**Files:**
- Create: `src/pagination/SimplePaginator.ts`
- Create: `test/pagination/SimplePaginator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/pagination/SimplePaginator.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { SimplePaginator } from '../../src/pagination/SimplePaginator'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('SimplePaginator', () => {
  it('constructs with items + perPage + currentPage + hasMore', () => {
    const p = new SimplePaginator(['a'], 10, 2, true)
    expect(p.items).toEqual(['a'])
    expect(p.perPage).toBe(10)
    expect(p.currentPage).toBe(2)
    expect(p.hasMore).toBe(true)
  })

  it('toMeta returns Laravel simple shape (no total, no last_page)', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a', 'b'], 5, 3, true)
    expect(p.toMeta(createMockEvent())).toEqual({
      current_page: 3,
      from: 11,
      path: 'https://api.example.com/users',
      per_page: 5,
      to: 12,
    })
  })

  it('toMeta from/to are null when items is empty', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    const p = new SimplePaginator([], 5, 1, false)
    const meta = p.toMeta(createMockEvent())
    expect(meta.from).toBe(null)
    expect(meta.to).toBe(null)
  })

  it('toLinks: prev present when currentPage > 1', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a'], 5, 3, true)
    expect(p.toLinks(createMockEvent()).prev).toBe('https://api.example.com/users?page=2&per_page=5')
  })

  it('toLinks: next present when hasMore is true', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a'], 5, 2, true)
    expect(p.toLinks(createMockEvent()).next).toBe('https://api.example.com/users?page=3&per_page=5')
  })

  it('toLinks: next is null when hasMore is false', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new SimplePaginator(['a'], 5, 2, false)
    expect(p.toLinks(createMockEvent()).next).toBe(null)
  })

  it('fromRequest parses ?page and ?per_page', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ page: '4', per_page: '20' })
    const p = SimplePaginator.fromRequest(createMockEvent(), ['x'], true)
    expect(p.currentPage).toBe(4)
    expect(p.perPage).toBe(20)
    expect(p.hasMore).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm exec vitest run test/pagination/SimplePaginator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pagination/SimplePaginator.ts`**

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

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run test/pagination/SimplePaginator.test.ts`
Expected: 7 tests passing.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pagination/SimplePaginator.ts test/pagination/SimplePaginator.test.ts
git commit -m "feat(pagination): add SimplePaginator (no total query, hasMore only)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: `CursorPaginator` + encode/decode + tests

**Files:**
- Create: `src/pagination/CursorPaginator.ts`
- Create: `test/pagination/CursorPaginator.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/pagination/CursorPaginator.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { CursorPaginator, decodeCursor, encodeCursor } from '../../src/pagination/CursorPaginator'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('encodeCursor / decodeCursor', () => {
  it('encodes a payload to base64url', () => {
    const encoded = encodeCursor({ key: 'abc', direction: 'next' })
    expect(typeof encoded).toBe('string')
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
  })

  it('decodes the encoded payload round-trip', () => {
    const encoded = encodeCursor({ key: 'user-42', direction: 'next' })
    expect(decodeCursor(encoded)).toEqual({ key: 'user-42', direction: 'next' })
  })

  it('decodeCursor with malformed input throws SyntaxError or similar', () => {
    expect(() => decodeCursor('not-base64-json')).toThrow()
  })
})

describe('CursorPaginator', () => {
  it('constructs with items + perPage + nextCursor + prevCursor', () => {
    const p = new CursorPaginator(['a', 'b'], 10, 'next-c', 'prev-c')
    expect(p.items).toEqual(['a', 'b'])
    expect(p.perPage).toBe(10)
    expect(p.nextCursor).toBe('next-c')
    expect(p.prevCursor).toBe('prev-c')
  })

  it('toMeta includes path, per_page, next_cursor, prev_cursor', () => {
    vi.mocked(h3.getRequestURL).mockReturnValue(new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, 'next-c', null)
    expect(p.toMeta(createMockEvent())).toEqual({
      path: 'https://api.example.com/users',
      per_page: 10,
      next_cursor: 'next-c',
      prev_cursor: null,
    })
  })

  it('toLinks includes next/prev URLs when cursors are present', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, 'next-c', 'prev-c')
    expect(p.toLinks(createMockEvent())).toEqual({
      prev: 'https://api.example.com/users?cursor=prev-c&per_page=10',
      next: 'https://api.example.com/users?cursor=next-c&per_page=10',
    })
  })

  it('toLinks: next is null when nextCursor is null', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, null, 'prev-c')
    expect(p.toLinks(createMockEvent()).next).toBe(null)
  })

  it('toLinks: prev is null when prevCursor is null', () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const p = new CursorPaginator(['a'], 10, 'next-c', null)
    expect(p.toLinks(createMockEvent()).prev).toBe(null)
  })

  it('fromRequest parses ?cursor and ?per_page', () => {
    vi.mocked(h3.getQuery).mockReturnValue({ cursor: 'incoming', per_page: '20' })
    const p = CursorPaginator.fromRequest(createMockEvent(), ['x'], 'user-99', null)
    expect(p.perPage).toBe(20)
    expect(p.nextCursor).not.toBe(null)
    expect(p.prevCursor).toBe(null)
  })

  it('fromRequest encodes nextCursorKey as base64url when provided', () => {
    vi.mocked(h3.getQuery).mockReturnValue({})
    const p = CursorPaginator.fromRequest(createMockEvent(), ['x'], 'user-99', null)
    expect(p.nextCursor).not.toBe(null)
    expect(decodeCursor(p.nextCursor!)).toEqual({ key: 'user-99', direction: 'next' })
  })

  it('round-trip: encode key → URL → parseCursorParams → decode recovers payload', async () => {
    const encoded = encodeCursor({ key: 'user-7', direction: 'next' })
    const decoded = decodeCursor(encoded)
    expect(decoded.key).toBe('user-7')
    expect(decoded.direction).toBe('next')
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm exec vitest run test/pagination/CursorPaginator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/pagination/CursorPaginator.ts`**

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

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run test/pagination/CursorPaginator.test.ts`
Expected: 11 tests passing.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pagination/CursorPaginator.ts test/pagination/CursorPaginator.test.ts
git commit -m "feat(pagination): add CursorPaginator with base64url cursor encoding

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: `PaginatedResourceCollection` + `isPaginator` + tests

**Files:**
- Create: `src/pagination/PaginatedResourceCollection.ts`
- Create: `src/pagination/isPaginator.ts`
- Create: `test/pagination/PaginatedResourceCollection.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// test/pagination/PaginatedResourceCollection.test.ts
import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: vi.fn(),
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'
// eslint-disable-next-line import/first
import { Resource } from '../../src/http/resources/Resource'
// eslint-disable-next-line import/first
import { CursorPaginator } from '../../src/pagination/CursorPaginator'
// eslint-disable-next-line import/first
import { LengthAwarePaginator } from '../../src/pagination/LengthAwarePaginator'
// eslint-disable-next-line import/first
import { PaginatedResourceCollection } from '../../src/pagination/PaginatedResourceCollection'
// eslint-disable-next-line import/first
import { isPaginatedResourceCollection, isPaginator } from '../../src/pagination/isPaginator'
// eslint-disable-next-line import/first
import { SimplePaginator } from '../../src/pagination/SimplePaginator'

interface User { id: string, email: string }

class UserResource extends Resource<User> {
  override toArray() {
    return { id: this.resource.id, email: this.resource.email }
  }
}

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}

describe('isPaginator', () => {
  it('is true for LengthAwarePaginator', () => {
    expect(isPaginator(new LengthAwarePaginator([], 0, 10, 1))).toBe(true)
  })

  it('is true for SimplePaginator', () => {
    expect(isPaginator(new SimplePaginator([], 10, 1, false))).toBe(true)
  })

  it('is true for CursorPaginator', () => {
    expect(isPaginator(new CursorPaginator([], 10, null, null))).toBe(true)
  })

  it('is false for arrays and other values', () => {
    expect(isPaginator([])).toBe(false)
    expect(isPaginator({})).toBe(false)
    expect(isPaginator(null)).toBe(false)
    expect(isPaginator('hello')).toBe(false)
  })
})

describe('isPaginatedResourceCollection', () => {
  it('is true for PaginatedResourceCollection instances', () => {
    const pc = new PaginatedResourceCollection(
      new LengthAwarePaginator([], 0, 10, 1),
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    expect(isPaginatedResourceCollection(pc)).toBe(true)
  })

  it('is false for plain ResourceCollection or arrays', () => {
    expect(isPaginatedResourceCollection([])).toBe(false)
    expect(isPaginatedResourceCollection({})).toBe(false)
  })
})

describe('PaginatedResourceCollection', () => {
  it('toArray returns {data, links, meta} with LengthAwarePaginator', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }, { id: 'u-2', email: 'b@x.com' }],
      10,
      2,
      2,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([
      { id: 'u-1', email: 'a@x.com' },
      { id: 'u-2', email: 'b@x.com' },
    ])
    expect(result.meta).toMatchObject({
      current_page: 2,
      last_page: 5,
      total: 10,
      per_page: 2,
    })
    expect(result.links).toMatchObject({
      first: expect.stringContaining('page=1'),
      last: expect.stringContaining('page=5'),
      prev: expect.stringContaining('page=1'),
      next: expect.stringContaining('page=3'),
    })
  })

  it('toArray with SimplePaginator returns the simple meta shape (no last_page, no total)', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new SimplePaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }],
      10,
      1,
      true,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.meta).not.toHaveProperty('last_page')
    expect(result.meta).not.toHaveProperty('total')
    expect(result.meta).toMatchObject({ current_page: 1, per_page: 10 })
  })

  it('toArray with CursorPaginator returns cursor meta shape (next_cursor, prev_cursor)', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new CursorPaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }],
      10,
      'next-encoded',
      null,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.meta).toMatchObject({ next_cursor: 'next-encoded', prev_cursor: null })
  })

  it('toArray with empty paginator returns data: [] and null from/to', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator<User>([], 0, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([])
    expect(result.meta.from).toBe(null)
    expect(result.meta.to).toBe(null)
  })

  it('toArray awaits async Resource.toArray', async () => {
    class AsyncUserResource extends Resource<User> {
      override async toArray() {
        await Promise.resolve()
        return { id: this.resource.id }
      }
    }
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator<User>(
      [{ id: 'u-1', email: 'a@x.com' }],
      1,
      10,
      1,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      AsyncUserResource as unknown as new (item: unknown) => AsyncUserResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([{ id: 'u-1' }])
  })

  it('toArray serializes nested Resources recursively', async () => {
    class AuthorResource extends Resource<{ name: string }> {
      override toArray() {
        return { name: this.resource.name }
      }
    }
    class PostResource extends Resource<{ id: string, authorName: string }> {
      override toArray() {
        return {
          id: this.resource.id,
          author: new AuthorResource({ name: this.resource.authorName }),
        }
      }
    }
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/posts'))
    const paginator = new LengthAwarePaginator<{ id: string, authorName: string }>(
      [{ id: 'p-1', authorName: 'Ada' }],
      1,
      10,
      1,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      PostResource as unknown as new (item: unknown) => PostResource,
    )
    const result = await pc.toArray(createMockEvent())
    expect(result.data).toEqual([{ id: 'p-1', author: { name: 'Ada' } }])
  })

  it('toArray passes the same event to each Resource.toArray', async () => {
    const spy = vi.fn().mockReturnValue({})
    class SpyResource extends Resource<User> {
      override toArray(event: H3Event) {
        return spy(event)
      }
    }
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const event = createMockEvent()
    const paginator = new LengthAwarePaginator<User>(
      [{ id: 'u-1', email: 'a' }, { id: 'u-2', email: 'b' }],
      2,
      10,
      1,
    )
    const pc = new PaginatedResourceCollection(
      paginator,
      SpyResource as unknown as new (item: unknown) => SpyResource,
    )
    await pc.toArray(event)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenNthCalledWith(1, event)
    expect(spy).toHaveBeenNthCalledWith(2, event)
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `pnpm exec vitest run test/pagination/PaginatedResourceCollection.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/pagination/isPaginator.ts`**

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

- [ ] **Step 4: Implement `src/pagination/PaginatedResourceCollection.ts`**

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

- [ ] **Step 5: Run tests to confirm pass**

Run: `pnpm exec vitest run test/pagination/PaginatedResourceCollection.test.ts`
Expected: 13 tests passing (4 for isPaginator + 2 for isPaginatedResourceCollection + 7 for PaginatedResourceCollection).

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/pagination/PaginatedResourceCollection.ts src/pagination/isPaginator.ts test/pagination/PaginatedResourceCollection.test.ts
git commit -m "feat(pagination): add PaginatedResourceCollection and type guards

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: `Resource.collection()` overload + tests

**Files:**
- Modify: `src/http/resources/Resource.ts`
- Modify: `test/http/resources/Resource.test.ts` (append 3 tests)

- [ ] **Step 1: Append failing tests to `test/http/resources/Resource.test.ts`**

Add this describe block at the END of the file (before the file's final close):

```ts
describe('Resource.collection — paginator overload', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // (Imports will be hoisted to the top of the file in Step 2 below.)

  class CountResource extends Resource<{ id: string }> {
    override toArray() {
      return { id: this.resource.id }
    }
  }

  it('returns a ResourceCollection when called with an array (regression)', () => {
    const result = CountResource.collection([{ id: 'a' }, { id: 'b' }])
    expect(result).toBeInstanceOf(ResourceCollection)
    expect(result).not.toBeInstanceOf(PaginatedResourceCollection)
  })

  it('returns a PaginatedResourceCollection when called with a LengthAwarePaginator', () => {
    const paginator = new LengthAwarePaginator([{ id: 'a' }], 1, 10, 1)
    const result = CountResource.collection(paginator)
    expect(result).toBeInstanceOf(PaginatedResourceCollection)
  })

  it('returns a PaginatedResourceCollection when called with a CursorPaginator', () => {
    const paginator = new CursorPaginator([{ id: 'a' }], 10, null, null)
    const result = CountResource.collection(paginator)
    expect(result).toBeInstanceOf(PaginatedResourceCollection)
  })
})
```

Also add the necessary imports at the top of the test file (after the existing imports, with the `// eslint-disable-next-line import/first` markers consistent with the file's style):

```ts
// eslint-disable-next-line import/first
import { ResourceCollection } from '../../../src/http/resources/ResourceCollection'
// eslint-disable-next-line import/first
import { CursorPaginator } from '../../../src/pagination/CursorPaginator'
// eslint-disable-next-line import/first
import { LengthAwarePaginator } from '../../../src/pagination/LengthAwarePaginator'
// eslint-disable-next-line import/first
import { PaginatedResourceCollection } from '../../../src/pagination/PaginatedResourceCollection'
```

(`ResourceCollection` may already be imported indirectly — check before duplicating.)

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `pnpm exec vitest run test/http/resources/Resource.test.ts`
Expected: 3 new tests FAIL — `Resource.collection(paginator)` currently throws or returns a `ResourceCollection` of a single Resource wrapping the paginator (not what we want).

- [ ] **Step 3: Replace `src/http/resources/Resource.ts` with the overloaded version**

```ts
import type { H3Event } from 'h3'

import type { Paginator } from '../../pagination/Paginator'
import { isPaginator } from '../../pagination/isPaginator'
import { PaginatedResourceCollection } from '../../pagination/PaginatedResourceCollection'

import { ResourceCollection } from './ResourceCollection'

export abstract class Resource<T> {
  readonly resource: T

  constructor(resource: T) {
    this.resource = resource
  }

  abstract toArray(event: H3Event): Record<string, unknown> | Promise<Record<string, unknown>>

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
}
```

- [ ] **Step 4: Run all Resource tests + the new ones to confirm pass**

Run: `pnpm exec vitest run test/http/resources/Resource.test.ts`
Expected: the existing tests + 3 new = total passes.

Also run all F2-C tests to confirm no regression:
Run: `pnpm exec vitest run test/http/resources/`
Expected: all green (existing 26 tests + 3 new).

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/http/resources/Resource.ts test/http/resources/Resource.test.ts
git commit -m "feat(resources): overload Resource.collection() to accept Paginator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: `serializeResource` integration + tests

**Files:**
- Modify: `src/http/resources/serializeResource.ts`
- Modify: `test/http/resources/serializeResource.test.ts` (append 2 tests)

- [ ] **Step 1: Append failing tests to `test/http/resources/serializeResource.test.ts`**

Add at the END of the file:

```ts
describe('serializeResource — PaginatedResourceCollection branch', () => {
  class UserResource extends Resource<{ id: string }> {
    override toArray() {
      return { id: this.resource.id }
    }
  }

  it('returns {data, links, meta} when value is a PaginatedResourceCollection', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator([{ id: 'a' }], 1, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const result = await serializeResource(pc, createMockEvent()) as {
      data: unknown[]
      links: Record<string, string | null>
      meta: Record<string, unknown>
    }
    expect(result.data).toEqual([{ id: 'a' }])
    expect(result.meta).toMatchObject({ current_page: 1 })
    expect(result.links).toBeDefined()
  })

  it('recursively serializes a plain object containing a PaginatedResourceCollection', async () => {
    vi.mocked(h3.getRequestURL).mockImplementation(() => new URL('https://api.example.com/users'))
    const paginator = new LengthAwarePaginator([{ id: 'a' }], 1, 10, 1)
    const pc = new PaginatedResourceCollection(
      paginator,
      UserResource as unknown as new (item: unknown) => UserResource,
    )
    const value = { users: pc, tag: 'demo' }
    const result = await serializeResource(value, createMockEvent()) as {
      users: { data: unknown[] }
      tag: string
    }
    expect(result.tag).toBe('demo')
    expect(result.users.data).toEqual([{ id: 'a' }])
  })
})
```

Also add these imports near the top alongside the existing ones (mirroring the file's `// eslint-disable-next-line import/first` pattern):

```ts
// eslint-disable-next-line import/first
import { LengthAwarePaginator } from '../../../src/pagination/LengthAwarePaginator'
// eslint-disable-next-line import/first
import { PaginatedResourceCollection } from '../../../src/pagination/PaginatedResourceCollection'
```

And add the h3 mock + `createMockEvent` if not already in the file (check before duplicating):

```ts
import type { H3Event } from 'h3'
import { vi } from 'vitest'

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRequestURL: vi.fn(),
  }
})

// eslint-disable-next-line import/first
import * as h3 from 'h3'

function createMockEvent(): H3Event {
  return { context: { params: {} } } as unknown as H3Event
}
```

If `createMockEvent` already exists in the file, reuse it. If `h3` is already mocked (it isn't currently), extend the mock — do not add a second `vi.mock` call.

- [ ] **Step 2: Run the new tests to confirm they fail**

Run: `pnpm exec vitest run test/http/resources/serializeResource.test.ts`
Expected: the 2 new tests FAIL — `serializeResource` currently treats `PaginatedResourceCollection` as a plain object (recurses into its `paginator` field), producing the wrong shape.

- [ ] **Step 3: Update `src/http/resources/serializeResource.ts`** — add the `isPaginatedResourceCollection` branch

The full file should now read:

```ts
import type { H3Event } from 'h3'

import { isPaginatedResourceCollection } from '../../pagination/isPaginator'

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
  if (isPaginatedResourceCollection(value)) {
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

The new branch is placed AFTER `isResourceCollection` and BEFORE `Array.isArray` to maintain precedence: the more-specific check wins.

- [ ] **Step 4: Run tests to confirm pass**

Run: `pnpm exec vitest run test/http/resources/serializeResource.test.ts`
Expected: existing tests + 2 new = total passing.

Also run full F2-C resource tests:
Run: `pnpm exec vitest run test/http/resources/`
Expected: all green.

- [ ] **Step 5: Run the full suite — no regression**

Run: `pnpm exec vitest run`
Expected: 205 (pre-F5) + all F5 unit tests so far (Tasks 1-7) all green. No regression in F0-F4.

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/http/resources/serializeResource.ts test/http/resources/serializeResource.test.ts
git commit -m "feat(resources): auto-serialize PaginatedResourceCollection in serializeResource

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Barrel + auto-imports + module wiring + http re-exports

**Files:**
- Create: `src/pagination/index.ts`
- Create: `src/runtime/server/pagination/index.ts`
- Modify: `src/module.ts`
- Modify: `src/http/index.ts`

- [ ] **Step 1: Create `src/pagination/index.ts`**

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

- [ ] **Step 2: Create `src/runtime/server/pagination/index.ts`**

```ts
export { LengthAwarePaginator } from '../../../pagination/LengthAwarePaginator'
export { SimplePaginator } from '../../../pagination/SimplePaginator'
export { CursorPaginator } from '../../../pagination/CursorPaginator'
```

Helpers (`parsePageParams`, `decodeCursor`, etc.) stay as explicit imports.

- [ ] **Step 3: Modify `src/module.ts`** — add `addServerImportsDir` for pagination

Read the current file. After the existing line:
```ts
    addServerImportsDir(resolver.resolve('./runtime/server/queue'))
```
add:
```ts
    addServerImportsDir(resolver.resolve('./runtime/server/pagination'))
```

- [ ] **Step 4: Modify `src/http/index.ts`** — re-export pagination surface

Append to the file:

```ts
export { LengthAwarePaginator, SimplePaginator, CursorPaginator, PaginatedResourceCollection, encodeCursor, decodeCursor, parsePageParams, parseCursorParams, isPaginator, isPaginatedResourceCollection, buildPageUrl, buildCursorUrl, getRequestPath } from '../pagination'
export type { Paginator, ParsePageParamsOptions, PageParams, CursorParams } from '../pagination'
```

- [ ] **Step 5: Lint + typecheck + full suite**

Run: `pnpm lint && pnpm typecheck && pnpm exec vitest run`
Expected: clean. Test count unchanged from Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/pagination/index.ts src/runtime/server/pagination/index.ts src/module.ts src/http/index.ts
git commit -m "feat(pagination): expose pagination barrel, server auto-imports, http re-exports

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Playground demo + 5 integration tests + final verification

**Files:**
- Modify: `playground/server/controllers/UserController.ts` — extend SEED + change `list()` to return `LengthAwarePaginator`
- Modify: `playground/server/controllers/userTokens.ts` — update `list` contract type
- Create: `playground/server/api/users-simple.get.ts`
- Create: `playground/server/api/users-cursor.get.ts`
- Modify: `test/integration/laravelize.test.ts` — append 5 integration tests

### Design notes

- The existing `GET /api/users` endpoint serves the existing 2-user SEED via `list()`. We extend the SEED to ~12 users and change `list()` to return a `LengthAwarePaginator`. The existing F2-C integration test (`'returns a collection of users serialized by UserResource.collection'`) WILL need to be updated because the response shape changes from a plain array to `{data, links, meta}` — this is intentional and a breaking change to the playground demo, NOT to the library.
- We add two new endpoints `/api/users-simple` and `/api/users-cursor` that exercise the other paginators.

- [ ] **Step 1: Read `playground/server/controllers/UserController.ts`** to capture the current SEED + `list` signature.

(The implementer should run `cat playground/server/controllers/UserController.ts` and `cat playground/server/controllers/userTokens.ts` to inspect.)

- [ ] **Step 2: Extend the SEED in `playground/server/controllers/UserController.ts`**

Replace the existing `SEED` constant (currently 2 users) with a 12-user list:

```ts
const SEED = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
  { id: 'user-3', email: 'alan@example.com', name: 'Alan Turing' },
  { id: 'user-4', email: 'donald@example.com', name: 'Donald Knuth' },
  { id: 'user-5', email: 'edsger@example.com', name: 'Edsger Dijkstra' },
  { id: 'user-6', email: 'barbara@example.com', name: 'Barbara Liskov' },
  { id: 'user-7', email: 'tony@example.com', name: 'Tony Hoare' },
  { id: 'user-8', email: 'john@example.com', name: 'John von Neumann' },
  { id: 'user-9', email: 'linus@example.com', name: 'Linus Torvalds' },
  { id: 'user-10', email: 'tim@example.com', name: 'Tim Berners-Lee' },
  { id: 'user-11', email: 'guido@example.com', name: 'Guido van Rossum' },
  { id: 'user-12', email: 'bjarne@example.com', name: 'Bjarne Stroustrup' },
] as const
```

- [ ] **Step 3: Change `list()` to return a `LengthAwarePaginator`**

The contract in `userTokens.ts` must change. Replace the `list` method signature in BOTH `userTokens.ts` and `UserController.ts` so that `list(input)` returns `PaginatedResourceCollection<Resource<{id, email, name}>>`.

Update `playground/server/controllers/userTokens.ts`:

```ts
import { createToken } from '../../../src/core/container/Token'
import type { PaginatedResourceCollection } from '../../../src/http'
import type { Resource, ResourceCollection } from '../../../src/http'

export interface UsersControllerContract {
  store(input: { body: { email: string, name: string }, query: undefined, params: undefined }): { id: string, email: string, name: string }
  register(input: { body: { email: string, name: string }, query: undefined, params: undefined }): Promise<{ id: string }>
  find(input: { body: undefined, query: undefined, params: { id: string } }): Resource<{ id: string, email: string, name: string }>
  list(input: { body: undefined, query: undefined, params: undefined }, event?: import('h3').H3Event): PaginatedResourceCollection<Resource<{ id: string, email: string, name: string }>>
}

export const userControllerToken = createToken<UsersControllerContract>('playground.user-controller')
```

> **Caveat:** the current `list` signature is `list(_input): ResourceCollection<...>`. Adding an `event` parameter changes the call shape from `defineLaravelizedHandler`. The handler currently calls `method.call(controller, input)` with one argument. We need to provide the event somehow. **Approach:** the `list` method extracts page params from the event itself via a request-scoped helper, OR the controller is constructed with access to the event via its constructor (not available in the current `scoped` lifetime).
>
> Cleanest fix: pagination params come from the request query string, but the controller doesn't have the event. The simplest path is to **use a FormRequest with a `query()` schema** that the handler reads and passes via `input.query`. The controller receives `{page, perPage}` already extracted.

**Revised approach: introduce `ListUsersRequest` to extract `page` and `per_page` from query.**

Create `playground/server/requests/ListUsersRequest.ts`:

```ts
import { z } from 'zod'

import { FormRequest } from '../../../src/http/FormRequest'

export class ListUsersRequest extends FormRequest {
  override query() {
    return z.object({
      page: z.coerce.number().int().positive().default(1),
      per_page: z.coerce.number().int().positive().max(100).default(5),
    })
  }
}
```

Update the contract `list` signature accordingly:

```ts
list(input: { body: undefined, query: { page: number, per_page: number }, params: undefined }): PaginatedResourceCollection<Resource<{ id: string, email: string, name: string }>>
```

Update `playground/server/controllers/UserController.ts` `list` body:

```ts
list(input: { body: undefined, query: { page: number, per_page: number }, params: undefined }): PaginatedResourceCollection<Resource<{ id: string, email: string, name: string }>> {
  const { page, per_page } = input.query
  const start = (page - 1) * per_page
  const slice = SEED.slice(start, start + per_page).map(user => ({ ...user }))
  const paginator = new LengthAwarePaginator(slice, SEED.length, per_page, page)
  return UserResource.collection(paginator)
}
```

Add necessary imports at the top of the file:

```ts
import { LengthAwarePaginator } from '../../../src/pagination/LengthAwarePaginator'
import type { PaginatedResourceCollection } from '../../../src/http'
```

(Keep existing imports as-is.)

- [ ] **Step 4: Update `playground/server/api/users.get.ts`** to pass the new `ListUsersRequest`

```ts
import { defineLaravelizedHandler } from '../../../src/http/defineLaravelizedHandler'
import { userControllerToken } from '../controllers/userTokens'
import { ListUsersRequest } from '../requests/ListUsersRequest'

export default defineLaravelizedHandler({
  controller: userControllerToken,
  method: 'list',
  request: ListUsersRequest,
})
```

- [ ] **Step 5: Update the existing F2-C integration test that asserted the bare array shape**

The test `'returns a collection of users serialized by UserResource.collection'` in `test/integration/laravelize.test.ts` will fail because the response shape now is `{data, links, meta}` instead of a bare array. Update its assertions to match the new shape (or REPLACE it with an assertion compatible with both shapes — we choose to update):

Find this block in `test/integration/laravelize.test.ts`:

```ts
  it('returns a collection of users serialized by UserResource.collection', async () => {
    const response = await $fetch<Array<{ id: string, email: string, name: string }>>('/api/users')

    expect(response).toHaveLength(2)
    expect(response[0]).toEqual({ id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' })
    expect(response[1]).toEqual({ id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' })
  })
```

Replace with:

```ts
  it('returns a paginated collection of users (first page, 5 per page by default)', async () => {
    const response = await $fetch<{
      data: Array<{ id: string, email: string, name: string }>
      meta: { current_page: number, per_page: number, total: number, last_page: number }
    }>('/api/users')

    expect(response.data).toHaveLength(5)
    expect(response.data[0]).toEqual({ id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' })
    expect(response.meta.current_page).toBe(1)
    expect(response.meta.per_page).toBe(5)
    expect(response.meta.total).toBe(12)
    expect(response.meta.last_page).toBe(3)
  })
```

- [ ] **Step 6: Create `playground/server/api/users-simple.get.ts`**

```ts
import { defineEventHandler, getQuery } from 'h3'

import { UserResource } from '../resources/UserResource'
import { SimplePaginator } from '../../../src/pagination/SimplePaginator'

const USERS = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
  { id: 'user-3', email: 'alan@example.com', name: 'Alan Turing' },
  { id: 'user-4', email: 'donald@example.com', name: 'Donald Knuth' },
  { id: 'user-5', email: 'edsger@example.com', name: 'Edsger Dijkstra' },
  { id: 'user-6', email: 'barbara@example.com', name: 'Barbara Liskov' },
] as const

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Math.max(Number(query.page ?? 1), 1)
  const perPage = 3
  const start = (page - 1) * perPage
  const slice = USERS.slice(start, start + perPage + 1).map(u => ({ ...u }))
  const hasMore = slice.length > perPage
  const items = slice.slice(0, perPage)
  const paginator = new SimplePaginator(items, perPage, page, hasMore)
  const pc = UserResource.collection(paginator)
  return await pc.toArray(event)
})
```

Note: this endpoint uses `defineEventHandler` directly (not `defineLaravelizedHandler`) because the response shape is already the final shape — no need to route through the handler's `serializeResource` wrapping. This keeps the demo focused on the paginator behavior.

- [ ] **Step 7: Create `playground/server/api/users-cursor.get.ts`**

```ts
import { defineEventHandler } from 'h3'

import { UserResource } from '../resources/UserResource'
import { CursorPaginator, decodeCursor } from '../../../src/pagination/CursorPaginator'
import { parseCursorParams } from '../../../src/pagination/extractParams'

const USERS = [
  { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace' },
  { id: 'user-2', email: 'grace@example.com', name: 'Grace Hopper' },
  { id: 'user-3', email: 'alan@example.com', name: 'Alan Turing' },
  { id: 'user-4', email: 'donald@example.com', name: 'Donald Knuth' },
  { id: 'user-5', email: 'edsger@example.com', name: 'Edsger Dijkstra' },
  { id: 'user-6', email: 'barbara@example.com', name: 'Barbara Liskov' },
] as const

export default defineEventHandler(async (event) => {
  const { cursor, perPage } = parseCursorParams(event)
  let startIndex = 0
  if (cursor) {
    const payload = decodeCursor(cursor)
    const idx = USERS.findIndex(u => u.id === payload.key)
    startIndex = idx >= 0 ? idx + 1 : 0
  }
  const slice = USERS.slice(startIndex, startIndex + perPage).map(u => ({ ...u }))
  const nextKey = startIndex + perPage < USERS.length ? slice[slice.length - 1]?.id ?? null : null
  const paginator = CursorPaginator.fromRequest(event, slice, nextKey, null)
  const pc = UserResource.collection(paginator)
  return await pc.toArray(event)
})
```

- [ ] **Step 8: Append 5 integration tests to `test/integration/laravelize.test.ts`**

Add BEFORE the closing `})` of the describe (after Step 5's updated test):

```ts
  it('GET /api/users?page=2&per_page=3 returns the second page with Laravel-shape meta', async () => {
    const response = await $fetch<{
      data: Array<{ id: string }>
      meta: { current_page: number, per_page: number, total: number, last_page: number, from: number | null, to: number | null }
    }>('/api/users?page=2&per_page=3')

    expect(response.data).toHaveLength(3)
    expect(response.data[0]?.id).toBe('user-4')
    expect(response.meta.current_page).toBe(2)
    expect(response.meta.per_page).toBe(3)
    expect(response.meta.total).toBe(12)
    expect(response.meta.last_page).toBe(4)
    expect(response.meta.from).toBe(4)
    expect(response.meta.to).toBe(6)
  })

  it('GET /api/users includes absolute URLs in links (first/last/prev/next)', async () => {
    const response = await $fetch<{
      links: { first: string | null, last: string | null, prev: string | null, next: string | null }
    }>('/api/users?page=2&per_page=3')

    expect(response.links.first).toMatch(/^https?:\/\/.+\/api\/users\?.*page=1.*per_page=3/)
    expect(response.links.last).toMatch(/^https?:\/\/.+\/api\/users\?.*page=4.*per_page=3/)
    expect(response.links.prev).toMatch(/page=1/)
    expect(response.links.next).toMatch(/page=3/)
  })

  it('GET /api/users?page=1 has prev=null; GET /api/users?page=last has next=null', async () => {
    const first = await $fetch<{ links: { prev: string | null, next: string | null } }>('/api/users?page=1&per_page=12')
    expect(first.links.prev).toBe(null)
    expect(first.links.next).toBe(null)
  })

  it('GET /api/users-simple returns SimplePaginator shape (no last_page, no total)', async () => {
    const response = await $fetch<{
      data: Array<{ id: string }>
      meta: Record<string, unknown>
      links: { prev: string | null, next: string | null }
    }>('/api/users-simple?page=1')

    expect(response.data).toHaveLength(3)
    expect(response.meta).not.toHaveProperty('last_page')
    expect(response.meta).not.toHaveProperty('total')
    expect(response.meta).toMatchObject({ current_page: 1, per_page: 3 })
    expect(response.links.next).not.toBe(null)
  })

  it('GET /api/users-cursor returns CursorPaginator shape with encoded cursors', async () => {
    const response = await $fetch<{
      data: Array<{ id: string }>
      meta: { next_cursor: string | null, prev_cursor: string | null, per_page: number }
      links: { prev: string | null, next: string | null }
    }>('/api/users-cursor?per_page=2')

    expect(response.data).toHaveLength(2)
    expect(response.meta.per_page).toBe(2)
    expect(response.meta.next_cursor).not.toBe(null)
    expect(response.links.next).toMatch(/cursor=/)
  })
```

- [ ] **Step 9: Run the integration suite (fresh prepare — MANDATORY)**

```
rm -rf .nuxt playground/.nuxt && pnpm dev:prepare && pnpm exec vitest run test/integration/laravelize.test.ts
```

Expected: existing integration tests (with the updated `list` test) + 5 new = all green.

- [ ] **Step 10: Run the full suite**

`pnpm exec vitest run`

Expected: 205 (pre-F5) + 7 (Task 2 extractParams) + 7 (Task 3 urls) + 12 (Task 4 LengthAware) + 7 (Task 5 Simple) + 11 (Task 6 Cursor) + 13 (Task 7 PaginatedResourceCollection + isPaginator) + 3 (Task 8 Resource overload) + 2 (Task 9 serializeResource) + 5 (Task 11 integration) = **272 tests passing**. (The exact count may vary by ±2; the key check is "no regressions, all new tests green".)

- [ ] **Step 11: Lint, typecheck, build**

`pnpm lint && pnpm typecheck && pnpm prepack`

Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add playground/server/controllers/UserController.ts playground/server/controllers/userTokens.ts playground/server/requests/ListUsersRequest.ts playground/server/api/users.get.ts playground/server/api/users-simple.get.ts playground/server/api/users-cursor.get.ts test/integration/laravelize.test.ts
git commit -m "feat(playground): demo pagination with LengthAware + Simple + Cursor endpoints

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Plan-end self-review checklist

After Task 11, verify against the spec acceptance criteria (§9):

1. ✅ Public surface — Task 10
2. ✅ Server auto-imports — Task 10
3. ✅ `fromRequest` operative — Tasks 4, 5, 6
4. ✅ Laravel-shape `LengthAwarePaginator` response — Tasks 4, 7
5. ✅ `SimplePaginator` + `CursorPaginator` shapes — Tasks 5, 6, 7
6. ✅ Cursor encode/decode base64url — Task 6
7. ✅ URLs respect reverse proxies — Task 3
8. ✅ `Resource.collection` overload — Task 8 (regression test for array path)
9. ✅ Handler auto-serializes via `serializeResource` — Task 9
10. ✅ F2-C tests green — Tasks 8, 9 (verified by running)
11. ✅ ~60 new tests (actual: 67 — within tolerance)
12. ✅ Playground demo — Task 11
13. ✅ lint/typecheck/build clean — Tasks 1, 4, 11

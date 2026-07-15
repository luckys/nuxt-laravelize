/* eslint-disable @stylistic/max-statements-per-line */
export type SearchValue = string | number | boolean | null
export type SearchDocument = Readonly<Record<string, SearchValue | readonly SearchValue[]>>

export interface Searchable {
  searchableKey(): string
  searchableType(): string
  toSearchableDocument(): SearchDocument
}

export interface SearchFilter { readonly field: string, readonly values: readonly SearchValue[] }
export interface SearchOrder { readonly field: string, readonly direction: 'asc' | 'desc' }
export interface SearchRequest {
  readonly index: string
  readonly query: string
  readonly filters: readonly SearchFilter[]
  readonly orders: readonly SearchOrder[]
  readonly page: number
  readonly perPage: number
}
export interface SearchHit { readonly key: string, readonly type: string, readonly document: SearchDocument, readonly score?: number }
export interface SearchPage { readonly data: readonly SearchHit[], readonly total: number, readonly page: number, readonly perPage: number, readonly lastPage: number }
export interface SearchEngine {
  search(request: SearchRequest): Promise<SearchPage>
  update(index: string, documents: readonly Searchable[]): Promise<void>
  delete(index: string, documents: readonly Pick<Searchable, 'searchableKey' | 'searchableType'>[]): Promise<void>
  flush(index: string): Promise<void>
}
export type SearchEngineFactory = () => SearchEngine

export class InMemorySearchEngine implements SearchEngine {
  readonly #documents = new Map<string, SearchHit>()
  async search(request: SearchRequest): Promise<SearchPage> {
    let data = [...this.#documents.entries()].filter(([key]) => key.startsWith(`${request.index}\0`)).map(([, hit]) => hit)
    const term = request.query.toLocaleLowerCase()
    if (term) data = data.filter(hit => JSON.stringify(hit.document).toLocaleLowerCase().includes(term))
    data = data.filter(hit => request.filters.every(filter => filter.values.some(value => equalSearchValue(hit.document[filter.field], value))))
    for (const order of [...request.orders].reverse()) data.sort((left, right) => compareSearchValues(left.document[order.field], right.document[order.field]) * (order.direction === 'desc' ? -1 : 1))
    const total = data.length
    const offset = (request.page - 1) * request.perPage
    return { data: data.slice(offset, offset + request.perPage), total, page: request.page, perPage: request.perPage, lastPage: Math.ceil(total / request.perPage) }
  }

  async update(index: string, documents: readonly Searchable[]): Promise<void> { for (const item of documents) this.#documents.set(`${index}\0${item.searchableType()}\0${item.searchableKey()}`, { key: item.searchableKey(), type: item.searchableType(), document: item.toSearchableDocument() }) }
  async delete(index: string, documents: readonly Pick<Searchable, 'searchableKey' | 'searchableType'>[]): Promise<void> { for (const item of documents) this.#documents.delete(`${index}\0${item.searchableType()}\0${item.searchableKey()}`) }
  async flush(index: string): Promise<void> { for (const key of this.#documents.keys()) if (key.startsWith(`${index}\0`)) this.#documents.delete(key) }
}

export class ScoutManager {
  readonly #factories = new Map<string, SearchEngineFactory>()
  readonly #engines = new Map<string, SearchEngine>()
  constructor(private defaultDriver?: string) {}
  extend(name: string, factory: SearchEngineFactory): this { this.#factories.set(assertDriver(name), factory); this.#engines.delete(name); return this }
  use(name: string): this { this.defaultDriver = assertDriver(name); return this }
  setDefaultDriver(name: string): this { return this.use(name) }
  engine(name = this.defaultDriver): SearchEngine {
    if (!name) throw new Error('Scout default driver is not configured.')
    const driver = assertDriver(name)
    const cached = this.#engines.get(driver)
    if (cached) return cached
    const factory = this.#factories.get(driver)
    if (!factory) throw new Error(`Scout driver "${driver}" is not registered.`)
    const engine = factory()
    this.#engines.set(driver, engine)
    return engine
  }

  purge(name = this.defaultDriver): this { if (name) this.#engines.delete(assertDriver(name)); return this }
  clear(): this { this.#engines.clear(); return this }
  search(index: string, query = ''): SearchBuilder { return new SearchBuilder(this.engine(), assertIndex(index), query) }
  update(index: string, documents: readonly Searchable[]): Promise<void> { return this.engine().update(assertIndex(index), documents) }
  delete(index: string, documents: readonly Pick<Searchable, 'searchableKey' | 'searchableType'>[]): Promise<void> { return this.engine().delete(assertIndex(index), documents) }
  import(index: string, documents: Iterable<Searchable> | AsyncIterable<Searchable>, batchSize = 500): Promise<void> { return importDocuments(this.engine(), assertIndex(index), documents, batchSize) }
  flush(index: string): Promise<void> { return this.engine().flush(assertIndex(index)) }
}

export class SearchBuilder {
  readonly #filters: SearchFilter[] = []
  readonly #orders: SearchOrder[] = []
  constructor(private readonly engine: SearchEngine, private readonly index: string, private readonly term: string) {}
  query(term: string): SearchBuilder { return new SearchBuilder(this.engine, this.index, term) }
  where(field: string, value: SearchValue): this { this.#filters.push({ field: assertField(field), values: [value] }); return this }
  whereIn(field: string, values: readonly SearchValue[]): this {
    if (values.length === 0) throw new Error('whereIn values cannot be empty.')
    this.#filters.push({ field: assertField(field), values: [...values] }); return this
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    if (direction !== 'asc' && direction !== 'desc') throw new Error('Search order direction must be asc or desc.')
    this.#orders.push({ field: assertField(field), direction }); return this
  }

  paginate(page = 1, perPage = 15): Promise<SearchPage> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new Error('Search pagination is invalid (page >= 1, perPage 1..100).')
    return this.engine.search({ index: this.index, query: this.term.trim(), filters: [...this.#filters], orders: [...this.#orders], page, perPage })
  }

  async get(limit = 15): Promise<readonly SearchHit[]> { return (await this.paginate(1, limit)).data }
}

async function importDocuments(engine: SearchEngine, index: string, documents: Iterable<Searchable> | AsyncIterable<Searchable>, batchSize: number): Promise<void> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) throw new Error('Scout import batch size must be between 1 and 10000.')
  let batch: Searchable[] = []
  for await (const document of documents) {
    batch.push(document)
    if (batch.length === batchSize) { await engine.update(index, batch); batch = [] }
  }
  if (batch.length) await engine.update(index, batch)
}
function assertIndex(value: string): string { if (!/^[a-z][\w-]{0,62}$/i.test(value)) throw new Error('Scout index is invalid.'); return value }
function assertField(value: string): string { if (!/^[a-z]\w{0,62}$/i.test(value)) throw new Error('Scout field is invalid.'); return value }
function assertDriver(value: string): string { if (!/^[a-z][\w-]{0,62}$/i.test(value)) throw new Error('Scout driver name is invalid.'); return value }
function equalSearchValue(actual: SearchDocument[string] | undefined, expected: SearchValue): boolean { return Array.isArray(actual) ? actual.includes(expected) : actual === expected }
function compareSearchValues(left: SearchDocument[string] | undefined, right: SearchDocument[string] | undefined): number { return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true }) }

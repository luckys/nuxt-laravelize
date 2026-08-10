/* eslint-disable @stylistic/max-statements-per-line */
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { ScoutManager, SearchDocument, SearchEngine, SearchHit, SearchPage, SearchRequest, SearchValue, Searchable } from '@luckys_luis/nuxt-laravelize-scout/runtime'
import { scoutDocuments } from './schema'

export { scoutDocuments } from './schema'

interface ExecuteResult { readonly rows?: readonly Record<string, unknown>[] }
export interface DrizzleScoutDatabase {
  execute(query: SQL): Promise<ExecuteResult | readonly Record<string, unknown>[]>
  transaction<T>(callback: (transaction: DrizzleScoutDatabase) => Promise<T>): Promise<T>
}
export interface DrizzleScoutOptions {
  readonly filterableFields?: readonly string[]
  readonly sortableFields?: readonly string[]
  readonly textSearchConfig?: string
}

export function registerDrizzlePostgresDriver(manager: ScoutManager, name: string, database: DrizzleScoutDatabase, options: DrizzleScoutOptions = {}): ScoutManager {
  return manager.extend(name, () => new DrizzlePostgresSearchEngine(database, options))
}

export class DrizzlePostgresSearchEngine implements SearchEngine {
  readonly #filterable: Set<string>
  readonly #sortable: Set<string>
  readonly #configuration: string
  constructor(private readonly database: DrizzleScoutDatabase, options: DrizzleScoutOptions = {}) {
    this.#filterable = validatedFields(options.filterableFields ?? [])
    this.#sortable = validatedFields(options.sortableFields ?? [])
    this.#configuration = options.textSearchConfig ?? 'simple'
    if (!/^[a-z]\w*$/i.test(this.#configuration)) throw new Error('PostgreSQL text search configuration is invalid.')
  }

  async search(request: SearchRequest): Promise<SearchPage> {
    assertRequest(request)
    const filters: SQL[] = [eq(scoutDocuments.index, request.index)]
    if (request.query) filters.push(sql`${scoutDocuments.searchVector} @@ websearch_to_tsquery(${this.#configuration}::regconfig, ${request.query})`)
    for (const filter of request.filters) {
      this.#assertAllowed(filter.field, this.#filterable, 'filter')
      if (filter.values.length === 0) throw new Error('Scout filter values cannot be empty.')
      const expression = sql`${scoutDocuments.document}->>${filter.field}`
      const values = filter.values.filter(value => value !== null).map(serialize)
      const includesNull = filter.values.includes(null)
      if (values.length === 0) filters.push(sql`${expression} is null`)
      else if (values.length === 1 && !includesNull) filters.push(sql`${expression} = ${values[0]}`)
      else filters.push(sql`(${inArray(expression, values)}${includesNull ? sql` or ${expression} is null` : sql``})`)
    }
    const rank = request.query ? sql<number>`ts_rank_cd(${scoutDocuments.searchVector}, websearch_to_tsquery(${this.#configuration}::regconfig, ${request.query}))` : sql<number>`0`
    const orders = request.orders.map((order) => {
      this.#assertAllowed(order.field, this.#sortable, 'sort')
      const expression = order.field === 'updated_at' ? sql`${scoutDocuments.updatedAt}` : sql`${scoutDocuments.document}->>${order.field}`
      return order.direction === 'desc' ? sql`${expression} desc` : sql`${expression} asc`
    })
    if (!orders.length && request.query) orders.push(sql`${rank} desc`)
    orders.push(sql`${scoutDocuments.key} asc`)
    const condition = and(...filters)!
    const offset = (request.page - 1) * request.perPage
    const result = rows(await this.database.execute(sql`select ${scoutDocuments.key} as key, ${scoutDocuments.type} as type, ${scoutDocuments.document} as document, ${rank} as score, count(*) over()::int as total from ${scoutDocuments} where ${condition} order by ${sql.join(orders, sql`, `)} limit ${request.perPage} offset ${offset}`))
    const total = Number(result[0]?.total ?? 0)
    return { data: result.map(row => ({ key: String(row.key), type: String(row.type), document: row.document as SearchDocument, score: Number(row.score) }) satisfies SearchHit), total, page: request.page, perPage: request.perPage, lastPage: Math.ceil(total / request.perPage) }
  }

  async update(index: string, documents: readonly Searchable[]): Promise<void> {
    assertBatch(documents)
    if (!documents.length) return
    await this.database.transaction(async (transaction) => {
      for (const searchable of documents) {
        const document = searchable.toSearchableDocument()
        await transaction.execute(sql`insert into ${scoutDocuments} (${sql.identifier('index_name')}, ${sql.identifier('document_type')}, ${sql.identifier('document_key')}, ${sql.identifier('document')}, ${sql.identifier('search_vector')}, ${sql.identifier('updated_at')}) values (${index}, ${searchable.searchableType()}, ${searchable.searchableKey()}, ${JSON.stringify(document)}::jsonb, to_tsvector(${this.#configuration}::regconfig, ${searchText(document)}), now()) on conflict (${sql.identifier('index_name')}, ${sql.identifier('document_type')}, ${sql.identifier('document_key')}) do update set ${sql.identifier('document')} = excluded.${sql.identifier('document')}, ${sql.identifier('search_vector')} = excluded.${sql.identifier('search_vector')}, ${sql.identifier('updated_at')} = now()`)
      }
    })
  }

  async delete(index: string, documents: readonly Pick<Searchable, 'searchableKey' | 'searchableType'>[]): Promise<void> {
    assertBatch(documents)
    if (!documents.length) return
    await this.database.transaction(async (transaction) => {
      for (const document of documents) await transaction.execute(sql`delete from ${scoutDocuments} where ${and(eq(scoutDocuments.index, index), eq(scoutDocuments.type, document.searchableType()), eq(scoutDocuments.key, document.searchableKey()))}`)
    })
  }

  async flush(index: string): Promise<void> { await this.database.execute(sql`delete from ${scoutDocuments} where ${eq(scoutDocuments.index, index)}`) }
  #assertAllowed(field: string, fields: Set<string>, operation: string): void { if (!fields.has(field) && !(operation === 'sort' && field === 'updated_at')) throw new Error(`Scout ${operation} field "${field}" is not allowed.`) }
}
function validatedFields(fields: readonly string[]): Set<string> { for (const field of fields) if (!/^[a-z]\w{0,62}$/i.test(field)) throw new Error(`Scout adapter field "${field}" is invalid.`); return new Set(fields) }
function serialize(value: SearchValue): string | null { return value === null ? null : String(value) }
function searchText(document: SearchDocument): string { return Object.values(document).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => value !== null).join(' ') }
function rows(result: ExecuteResult | readonly Record<string, unknown>[]): readonly Record<string, unknown>[] { return Array.isArray(result) ? result : 'rows' in result ? result.rows ?? [] : [] }
function assertRequest(request: SearchRequest): void { if (!Number.isSafeInteger(request.page) || request.page < 1 || !Number.isSafeInteger(request.perPage) || request.perPage < 1 || request.perPage > 100) throw new Error('Search pagination is invalid (page >= 1, perPage 1..100).') }
function assertBatch(documents: readonly unknown[]): void { if (documents.length > 10_000) throw new Error('Scout sync batch cannot exceed 10000 documents.') }

/* eslint-disable @stylistic/max-statements-per-line, @stylistic/lines-between-class-members */
import { sql, type SQL } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { ScoutManager, SearchDocument, SearchEngine, SearchHit, SearchPage, SearchRequest, SearchValue, Searchable } from '@luckys_luis/nuxt-laravelize-scout/runtime'
import { sqliteScoutDocuments } from './sqlite-schema'

export { sqliteScoutDocuments } from './sqlite-schema'

export interface DrizzleSQLiteDatabase {
  all(query: SQL): readonly Record<string, unknown>[]
  run(query: SQL): unknown
  transaction<T>(callback: (transaction: DrizzleSQLiteDatabase) => T): T
}
export interface SQLiteScoutOptions { readonly filterableFields?: readonly string[], readonly sortableFields?: readonly string[] }
export interface LibSQLStatement { readonly sql: string, readonly args: readonly (string | number | null)[] }

export function registerDrizzleSQLiteDriver(manager: ScoutManager, name: string, database: DrizzleSQLiteDatabase, options: SQLiteScoutOptions = {}): ScoutManager {
  return manager.extend(name, () => new DrizzleSQLiteSearchEngine(database, options))
}

export class DrizzleSQLiteSearchEngine implements SearchEngine {
  readonly #options: ValidatedSQLiteOptions
  constructor(private readonly database: DrizzleSQLiteDatabase, options: SQLiteScoutOptions = {}) { this.#options = validateOptions(options) }
  async search(request: SearchRequest): Promise<SearchPage> {
    assertRequest(request)
    const data = await this.database.all(buildSQLiteSearch(request, this.#options))
    const total = request.query ? Number((await this.database.all(buildSQLiteCount(request, this.#options)))[0]?.total ?? 0) : undefined
    return pageFromRows(data, request, total)
  }
  async update(index: string, documents: readonly Searchable[]): Promise<void> {
    assertBatch(documents)
    if (!documents.length) return
    this.database.transaction((transaction) => { for (const document of documents) for (const statement of buildSQLiteUpdate(index, document)) transaction.run(statement) })
  }
  async delete(index: string, documents: readonly Pick<Searchable, 'searchableKey' | 'searchableType'>[]): Promise<void> {
    assertBatch(documents)
    if (!documents.length) return
    this.database.transaction((transaction) => { for (const document of documents) for (const statement of buildSQLiteDelete(index, document)) transaction.run(statement) })
  }
  async flush(index: string): Promise<void> { this.database.transaction((transaction) => { transaction.run(sql`delete from scout_documents_fts where index_name = ${index}`); transaction.run(sql`delete from ${sqliteScoutDocuments} where ${sqliteScoutDocuments.index} = ${index}`) }) }
}

interface ValidatedSQLiteOptions { readonly filterable: Set<string>, readonly sortable: Set<string> }
export function validateOptions(options: SQLiteScoutOptions): ValidatedSQLiteOptions { return { filterable: validatedFields(options.filterableFields ?? []), sortable: validatedFields(options.sortableFields ?? []) } }
export function buildSQLiteSearch(request: SearchRequest, options: ValidatedSQLiteOptions): SQL {
  const { conditions, join } = searchParts(request, options)
  const orders = request.orders.map((order) => { assertAllowed(order.field, options.sortable, 'sort'); const expression = order.field === 'updated_at' ? sql`d.updated_at` : sql`json_extract(d.document, ${`$.${order.field}`})`; return order.direction === 'desc' ? sql`${expression} desc` : sql`${expression} asc` })
  if (!orders.length && request.query) orders.push(sql`bm25(scout_documents_fts) asc`)
  orders.push(sql`d.document_key asc`)
  const score = request.query ? sql`-bm25(scout_documents_fts)` : sql`0`
  const total = request.query ? sql`0` : sql`count(*) over()`
  return sql`select d.document_key as key, d.document_type as type, d.document, ${score} as score, ${total} as total from scout_documents d ${join} where ${sql.join(conditions, sql` and `)} order by ${sql.join(orders, sql`, `)} limit ${request.perPage} offset ${(request.page - 1) * request.perPage}`
}
export function buildSQLiteCount(request: SearchRequest, options: ValidatedSQLiteOptions): SQL {
  const { conditions, join } = searchParts(request, options)
  return sql`select count(*) as total from scout_documents d ${join} where ${sql.join(conditions, sql` and `)}`
}
export function buildSQLiteUpdate(index: string, searchable: Searchable): readonly SQL[] {
  const type = searchable.searchableType(); const key = searchable.searchableKey(); const document = searchable.toSearchableDocument(); const json = JSON.stringify(document); const text = searchText(document)
  return [sql`delete from scout_documents_fts where index_name = ${index} and document_type = ${type} and document_key = ${key}`, sql`insert into ${sqliteScoutDocuments} (index_name, document_type, document_key, document, updated_at) values (${index}, ${type}, ${key}, ${json}, unixepoch()) on conflict (index_name, document_type, document_key) do update set document = excluded.document, updated_at = unixepoch()`, sql`insert into scout_documents_fts (index_name, document_type, document_key, body) values (${index}, ${type}, ${key}, ${text})`]
}
export function buildSQLiteDelete(index: string, document: Pick<Searchable, 'searchableKey' | 'searchableType'>): readonly SQL[] { const type = document.searchableType(); const key = document.searchableKey(); return [sql`delete from scout_documents_fts where index_name = ${index} and document_type = ${type} and document_key = ${key}`, sql`delete from ${sqliteScoutDocuments} where ${sqliteScoutDocuments.index} = ${index} and ${sqliteScoutDocuments.type} = ${type} and ${sqliteScoutDocuments.key} = ${key}`] }
export function buildSQLiteFlush(index: string): readonly SQL[] { return [sql`delete from scout_documents_fts where index_name = ${index}`, sql`delete from ${sqliteScoutDocuments} where ${sqliteScoutDocuments.index} = ${index}`] }
export function compileLibSQL(statement: SQL): LibSQLStatement { const query = new SQLiteSyncDialect().sqlToQuery(statement); return { sql: query.sql, args: query.params as (string | number | null)[] } }
export function pageFromRows(rows: readonly Record<string, unknown>[], request: SearchRequest, totalOverride?: number): SearchPage { const total = totalOverride ?? Number(rows[0]?.total ?? 0); return { data: rows.map(row => ({ key: String(row.key), type: String(row.type), document: parseDocument(row.document), score: Number(row.score) }) satisfies SearchHit), total, page: request.page, perPage: request.perPage, lastPage: Math.ceil(total / request.perPage) } }
function searchParts(request: SearchRequest, options: ValidatedSQLiteOptions): { conditions: SQL[], join: SQL } {
  const conditions: SQL[] = [sql`d.index_name = ${request.index}`]
  if (request.query) conditions.push(sql`scout_documents_fts match ${request.query}`)
  for (const filter of request.filters) {
    assertAllowed(filter.field, options.filterable, 'filter')
    if (!filter.values.length) throw new Error('Scout filter values cannot be empty.')
    const path = `$.${filter.field}`
    const values = filter.values.filter(value => value !== null).map(serialize)
    const nullCondition = filter.values.includes(null) ? sql`json_extract(d.document, ${path}) is null` : undefined
    const valueCondition = values.length ? sql`json_extract(d.document, ${path}) in (${sql.join(values.map(value => sql`${value}`), sql`, `)})` : undefined
    conditions.push(valueCondition && nullCondition ? sql`(${valueCondition} or ${nullCondition})` : (valueCondition ?? nullCondition)!)
  }
  const join = request.query ? sql`join scout_documents_fts on scout_documents_fts.index_name = d.index_name and scout_documents_fts.document_type = d.document_type and scout_documents_fts.document_key = d.document_key` : sql``
  return { conditions, join }
}
function parseDocument(value: unknown): SearchDocument { return (typeof value === 'string' ? JSON.parse(value) : value) as SearchDocument }
function validatedFields(fields: readonly string[]): Set<string> { for (const field of fields) if (!/^[a-z]\w{0,62}$/i.test(field)) throw new Error(`Scout adapter field "${field}" is invalid.`); return new Set(fields) }
function assertAllowed(field: string, fields: Set<string>, operation: string): void { if (!fields.has(field) && !(operation === 'sort' && field === 'updated_at')) throw new Error(`Scout ${operation} field "${field}" is not allowed.`) }
function serialize(value: SearchValue): string | number { return typeof value === 'boolean' ? Number(value) : value as string | number }
function searchText(document: SearchDocument): string { return Object.values(document).flatMap(value => Array.isArray(value) ? value : [value]).filter(value => value !== null).join(' ') }
function assertRequest(request: SearchRequest): void { if (!Number.isSafeInteger(request.page) || request.page < 1 || !Number.isSafeInteger(request.perPage) || request.perPage < 1 || request.perPage > 100) throw new Error('Search pagination is invalid (page >= 1, perPage 1..100).') }
function assertBatch(documents: readonly unknown[]): void { if (documents.length > 10_000) throw new Error('Scout sync batch cannot exceed 10000 documents.') }

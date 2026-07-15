/* eslint-disable @stylistic/max-statements-per-line */
import type { SearchEngine, SearchPage, SearchRequest, Searchable } from '@nuxt-laravelize/scout/runtime'
import { buildSQLiteDelete, buildSQLiteFlush, buildSQLiteSearch, buildSQLiteUpdate, compileLibSQL, pageFromRows, validateOptions, type LibSQLStatement, type SQLiteScoutOptions } from './sqlite'

interface LibSQLResultSet { readonly rows: readonly Record<string, unknown>[] }
export interface LibSQLScoutClient {
  execute(statement: LibSQLStatement): Promise<LibSQLResultSet>
  batch(statements: LibSQLStatement[], mode?: 'write' | 'read' | 'deferred'): Promise<readonly LibSQLResultSet[]>
}

export class TursoLibSQLSearchEngine implements SearchEngine {
  readonly #options
  constructor(private readonly client: LibSQLScoutClient, options: SQLiteScoutOptions = {}) { this.#options = validateOptions(options) }
  async search(request: SearchRequest): Promise<SearchPage> { assertRequest(request); return pageFromRows((await this.client.execute(compileLibSQL(buildSQLiteSearch(request, this.#options)))).rows, request) }
  async update(index: string, documents: readonly Searchable[]): Promise<void> { assertBatch(documents); if (documents.length) await this.client.batch(documents.flatMap(document => buildSQLiteUpdate(index, document)).map(compileLibSQL), 'write') }
  async delete(index: string, documents: readonly Pick<Searchable, 'searchableKey' | 'searchableType'>[]): Promise<void> { assertBatch(documents); if (documents.length) await this.client.batch(documents.flatMap(document => buildSQLiteDelete(index, document)).map(compileLibSQL), 'write') }
  async flush(index: string): Promise<void> { await this.client.batch(buildSQLiteFlush(index).map(compileLibSQL), 'write') }
}
function assertBatch(documents: readonly unknown[]): void { if (documents.length > 10_000) throw new Error('Scout sync batch cannot exceed 10000 documents.') }
function assertRequest(request: SearchRequest): void { if (!Number.isSafeInteger(request.page) || request.page < 1 || !Number.isSafeInteger(request.perPage) || request.perPage < 1 || request.perPage > 100) throw new Error('Search pagination is invalid (page >= 1, perPage 1..100).') }

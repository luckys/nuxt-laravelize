import { describe, expect, it, vi } from 'vitest'
import { ScoutManager, type SearchEngine, type Searchable } from '../../src/runtime/Scout'

const page = { data: [], total: 0, page: 2, perPage: 10, lastPage: 0 }
describe('ScoutManager', () => {
  it('builds a validated engine request', async () => {
    const search = vi.fn().mockResolvedValue(page)
    const scout = new ScoutManager({ search } as unknown as SearchEngine)
    await scout.search('articles', ' cancer care ').where('status', 'published').whereIn('locale', ['en', 'es']).orderBy('published_at', 'desc').paginate(2, 10)
    expect(search).toHaveBeenCalledWith({ index: 'articles', query: 'cancer care', filters: [{ field: 'status', values: ['published'] }, { field: 'locale', values: ['en', 'es'] }], orders: [{ field: 'published_at', direction: 'desc' }], page: 2, perPage: 10 })
  })
  it('imports sequential batches', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const scout = new ScoutManager({ update } as unknown as SearchEngine)
    const documents = Array.from({ length: 3 }, (_, key) => ({ searchableKey: () => String(key), searchableType: () => 'article', toSearchableDocument: () => ({ title: String(key) }) })) satisfies Searchable[]
    await scout.import('articles', documents, 2)
    expect(update.mock.calls.map(call => call[1].length)).toEqual([2, 1])
  })
  it('rejects unsafe fields and excessive pages before calling the engine', () => {
    const scout = new ScoutManager({} as SearchEngine)
    expect(() => scout.search('articles').where('status->x', 'x')).toThrow('field is invalid')
    expect(() => scout.search('articles').paginate(1, 101)).toThrow('pagination is invalid')
  })
})

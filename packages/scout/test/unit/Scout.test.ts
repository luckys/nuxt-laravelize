import { describe, expect, it, vi } from 'vitest'
import { ScoutManager, type SearchEngine, type Searchable } from '../../src/runtime/Scout'

const page = { data: [], total: 0, page: 2, perPage: 10, lastPage: 0 }
describe('ScoutManager', () => {
  it('resolves named engines lazily and caches each instance', () => {
    const memory = {} as SearchEngine
    const factory = vi.fn(() => memory)
    const scout = new ScoutManager().extend('memory', factory)

    expect(factory).not.toHaveBeenCalled()
    expect(scout.engine('memory')).toBe(memory)
    expect(scout.engine('memory')).toBe(memory)
    expect(factory).toHaveBeenCalledOnce()
  })
  it('selects and overrides the default engine', () => {
    const memory = {} as SearchEngine
    const database = {} as SearchEngine
    const scout = new ScoutManager('memory').extend('memory', () => memory).extend('database', () => database)

    expect(scout.engine()).toBe(memory)
    expect(scout.use('database').engine()).toBe(database)
    expect(scout.setDefaultDriver('memory').engine()).toBe(memory)
  })
  it('fails explicitly for an unknown driver', () => {
    expect(() => new ScoutManager('missing').engine()).toThrow('Scout driver "missing" is not registered.')
    expect(() => new ScoutManager().engine()).toThrow('Scout default driver is not configured.')
  })
  it('purges cached engines without eagerly recreating them', () => {
    const factory = vi.fn(() => ({} as SearchEngine))
    const scout = new ScoutManager('memory').extend('memory', factory)
    const first = scout.engine()
    scout.purge('memory')
    expect(factory).toHaveBeenCalledOnce()
    expect(scout.engine()).not.toBe(first)
    scout.clear()
    expect(scout.engine()).toBeDefined()
    expect(factory).toHaveBeenCalledTimes(3)
  })
  it('builds a validated engine request', async () => {
    const search = vi.fn().mockResolvedValue(page)
    const scout = managerWith({ search } as unknown as SearchEngine)
    await scout.search('articles', ' cancer care ').where('status', 'published').whereIn('locale', ['en', 'es']).orderBy('published_at', 'desc').paginate(2, 10)
    expect(search).toHaveBeenCalledWith({ index: 'articles', query: 'cancer care', filters: [{ field: 'status', values: ['published'] }, { field: 'locale', values: ['en', 'es'] }], orders: [{ field: 'published_at', direction: 'desc' }], page: 2, perPage: 10 })
  })
  it('imports sequential batches', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const scout = managerWith({ update } as unknown as SearchEngine)
    const documents = Array.from({ length: 3 }, (_, key) => ({ searchableKey: () => String(key), searchableType: () => 'article', toSearchableDocument: () => ({ title: String(key) }) })) satisfies Searchable[]
    await scout.import('articles', documents, 2)
    expect(update.mock.calls.map(call => call[1].length)).toEqual([2, 1])
  })
  it('routes index maintenance through the selected default engine', async () => {
    const selected = { update: vi.fn(), delete: vi.fn(), flush: vi.fn() } as unknown as SearchEngine
    const unused = { update: vi.fn(), delete: vi.fn(), flush: vi.fn() } as unknown as SearchEngine
    const scout = new ScoutManager('selected').extend('selected', () => selected).extend('unused', () => unused)
    const documents: Searchable[] = [{ searchableKey: () => '1', searchableType: () => 'article', toSearchableDocument: () => ({ title: 'One' }) }]

    await scout.update('articles', documents)
    await scout.delete('articles', documents)
    await scout.flush('articles')

    expect(selected.update).toHaveBeenCalledWith('articles', documents)
    expect(selected.delete).toHaveBeenCalledWith('articles', documents)
    expect(selected.flush).toHaveBeenCalledWith('articles')
    expect(unused.update).not.toHaveBeenCalled()
  })
  it('rejects unsafe fields and excessive pages before calling the engine', () => {
    const scout = managerWith({} as SearchEngine)
    expect(() => scout.search('articles').where('status->x', 'x')).toThrow('field is invalid')
    expect(() => scout.search('articles').paginate(1, 101)).toThrow('pagination is invalid')
  })
})

function managerWith(engine: SearchEngine): ScoutManager {
  return new ScoutManager('test').extend('test', () => engine)
}

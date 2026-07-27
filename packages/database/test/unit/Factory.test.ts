import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Factory,
  recycle,
  type FactoryPersistenceAdapter,
  type SequenceValue,
} from '../../src/database/factories'

interface Draft {
  name: string
  trace?: string[]
  related?: unknown
}

class DraftFactory<Persisted = Draft> extends Factory<Draft, Persisted> {
  protected definition(): Draft { return { name: 'definition', trace: ['definition'] } }
}

describe('Factory', () => {
  it('applies states and sequences with indexes before call-site overrides', () => {
    const sequence: SequenceValue<Draft>[] = [
      (draft, index) => ({ name: `sequence-${index}`, trace: [...draft.trace!, `sequence-${index}`] }),
    ]

    const made = new DraftFactory()
      .count(2)
      .state((draft, index) => ({ name: `state-${index}`, trace: [...draft.trace!, `state-${index}`] }))
      .sequence(sequence)
      .make({ name: 'override' })

    expect(made).toEqual([
      { name: 'override', trace: ['definition', 'state-0', 'sequence-0'] },
      { name: 'override', trace: ['definition', 'state-1', 'sequence-1'] },
    ])
    expectTypeOf(made).toEqualTypeOf<Draft[]>()
  })

  it('composes for and has relationships in deterministic order', () => {
    const parent = recycle([{ id: 'parent-1' }])
    const children = new class extends Factory<{ id: string }> {
      protected definition() { return { id: 'child' } }
    }().count(2)

    const made = new DraftFactory()
      .state(draft => ({ trace: [...draft.trace!, 'state'] }))
      .sequence([draft => ({ trace: [...draft.trace!, 'sequence'] })])
      .for(parent, (draft, related) => ({ related, trace: [...draft.trace!, 'for'] }))
      .has(children, (draft, related) => ({ related: [draft.related, related], trace: [...draft.trace!, 'has'] }))
      .make({ name: 'override' })

    expect(made).toEqual({
      name: 'override',
      trace: ['definition', 'state', 'sequence', 'for', 'has'],
      related: [{ id: 'parent-1' }, [{ id: 'child' }, { id: 'child' }]],
    })
  })

  it('supports nested explicit relationships without ORM metadata', () => {
    const authors = recycle([{ id: 'author-a' }, { id: 'author-b' }])
    const posts = new class extends Factory<{ title: string, author?: { id: string } }> {
      protected definition() { return { title: 'Post' } }
    }()
      .count(2)
      .for(authors, (_post, author) => ({ author }))

    const team = new class extends Factory<{ posts: Array<{ title: string, author?: { id: string } }> }> {
      protected definition() { return { posts: [] } }
    }().has(posts, (_team, related) => ({ posts: related }))

    expect(team.make()).toEqual({
      posts: [
        { title: 'Post', author: { id: 'author-a' } },
        { title: 'Post', author: { id: 'author-b' } },
      ],
    })
  })

  it('cycles recycled values by root index and keeps a defensive copy', () => {
    const values = [{ id: 1 }, { id: 2 }]
    const recycled = recycle(values)
    values.push({ id: 3 })

    const made = new DraftFactory().count(3)
      .for(recycled, (_draft, related, rootIndex) => ({ name: `root-${rootIndex}`, related }))
      .make()

    expect(made.map(item => item.related)).toEqual([{ id: 1 }, { id: 2 }, { id: 1 }])
    expect(made.map(item => item.name)).toEqual(['root-0', 'root-1', 'root-2'])
    expect(Object.isFrozen(recycled)).toBe(true)
    expect(Object.isFrozen(recycled.values)).toBe(true)
  })

  it('reuses a related factory count without leaking configuration between roots or factories', () => {
    const related = new class extends Factory<{ position: number }> {
      protected definition() { return { position: -1 } }
    }().count(2).sequence([(_draft, index) => ({ position: index })])

    const first = new DraftFactory().count(2)
      .has(related, (_draft, items) => ({ related: items }))
      .make()
    const second = new DraftFactory().make()

    expect(first.map(item => item.related)).toEqual([
      [{ position: 0 }, { position: 1 }],
      [{ position: 0 }, { position: 1 }],
    ])
    expect(related.make()).toEqual([{ position: 0 }, { position: 1 }])
    expect(second).toEqual({ name: 'definition', trace: ['definition'] })
  })

  it('returns persisted adapter results with scalar and array cardinality', async () => {
    const adapter: FactoryPersistenceAdapter<Draft, number> = {
      persist: async (_draft, index) => index + 10,
    }

    const scalar = await new DraftFactory<number>().create(adapter)
    const many = await new DraftFactory<number>().count(2).create(adapter)

    expect(scalar).toBe(10)
    expect(many).toEqual([10, 11])
    expectTypeOf(scalar).toEqualTypeOf<number>()
    expectTypeOf(many).toEqualTypeOf<number[]>()
  })

  it('keeps callback persistence compatible, sequential, and returns drafts', async () => {
    const events: string[] = []
    const made = await new DraftFactory().count(2).create(async (draft, index) => {
      events.push(`start-${index}-${draft.name}`)
      await Promise.resolve()
      events.push(`end-${index}`)
    })

    expect(events).toEqual(['start-0-definition', 'end-0', 'start-1-definition', 'end-1'])
    expect(made).toHaveLength(2)
    expectTypeOf(made).toEqualTypeOf<Draft[]>()
  })

  it('runs lifecycle hooks around persistence for each item in exact sequential order', async () => {
    const events: string[] = []
    const adapter: FactoryPersistenceAdapter<Draft, { id: number }> = {
      persist: async (_draft, index) => {
        events.push(`persist-${index}`)
        return { id: index }
      },
    }

    await new DraftFactory<{ id: number }>().count(2)
      .beforeCreate(async (_draft, index) => { events.push(`before-${index}`) })
      .afterCreate(async (persisted, _draft, index) => { events.push(`after-${index}-${persisted.id}`) })
      .create(adapter)

    expect(events).toEqual([
      'before-0', 'persist-0', 'after-0-0',
      'before-1', 'persist-1', 'after-1-1',
    ])
  })

  it('does not run asynchronous persistence lifecycle hooks during make', () => {
    const events: string[] = []
    const made = new DraftFactory()
      .beforeCreate(() => { events.push('before') })
      .afterCreate(() => { events.push('after') })
      .make()

    expect(made.name).toBe('definition')
    expect(events).toEqual([])
  })

  it('stops immediately when a hook or persister fails', async () => {
    const events: string[] = []
    const factory = new DraftFactory().count(3)
      .beforeCreate((_draft, index) => {
        events.push(`before-${index}`)
        if (index === 1) throw new Error('stop')
      })
      .afterCreate((_persisted, _draft, index) => {
        events.push(`after-${index}`)
      })

    await expect(factory.create(async (_draft, index) => {
      events.push(`persist-${index}`)
    })).rejects.toThrow('stop')
    expect(events).toEqual(['before-0', 'persist-0', 'after-0', 'before-1'])
  })

  it('does not run after hooks or later items after persistence fails', async () => {
    const events: string[] = []
    const adapter: FactoryPersistenceAdapter<Draft, Draft> = {
      persist: (draft, index) => {
        events.push(`persist-${index}`)
        if (index === 1) throw new Error('persistence failed')
        return draft
      },
    }
    const factory = new DraftFactory().count(3)
      .afterCreate((_persisted, _draft, index) => { events.push(`after-${index}`) })

    await expect(factory.create(adapter)).rejects.toThrow('persistence failed')
    expect(events).toEqual(['persist-0', 'after-0', 'persist-1'])
  })

  it('validates count, sequence, recycle, and ambiguous relationship outputs', () => {
    expect(() => new DraftFactory().count(0)).toThrow('count must be a positive integer')
    expect(() => new DraftFactory().sequence([])).toThrow('sequence must contain at least one state')
    expect(() => recycle([])).toThrow('recycle must contain at least one value')

    const many = new DraftFactory().count(2)
    expect(() => new DraftFactory()
      .for(many as unknown as Factory<Draft>, (_draft, related) => ({ related }))
      .make()).toThrow('for relationship factory must make exactly one item')

    expect(() => new DraftFactory()
      .for(recycle([{ id: 1 }]), () => [] as unknown as Partial<Draft>)
      .make()).toThrow('relationship composer must return an object, not an array')
  })
})

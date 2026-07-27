import { builtInFaker, type FakerShim } from './faker'

export type MaybePromise<T> = T | Promise<T>
export type StateMutator<T> = Partial<T> | ((draft: T, index: number) => Partial<T> | T)
export type SequenceValue<T> = Partial<T> | ((draft: T, index: number) => Partial<T> | T)
export type FactoryOutput<T, Count extends number> = Count extends 1
  ? T
  : number extends Count ? T | T[] : T[]

export type FactoryPersister<T> = (draft: T, index: number) => MaybePromise<void>

export interface FactoryPersistenceAdapter<TDraft, TPersisted> {
  persist(draft: TDraft, index: number): MaybePromise<TPersisted>
}

export type BeforeCreateHook<TDraft> = (draft: TDraft, index: number) => MaybePromise<void>
export type AfterCreateHook<TDraft, TPersisted> = (
  persisted: TPersisted,
  draft: TDraft,
  index: number,
) => MaybePromise<void>

export type RelationshipComposer<TRoot, TRelated> = (
  root: TRoot,
  related: TRelated,
  rootIndex: number,
) => Partial<TRoot> | TRoot

const recycledValuesMarker: unique symbol = Symbol('nuxt-laravelize.recycled-values')

export interface RecycledValues<T> {
  readonly [recycledValuesMarker]: true
  readonly values: readonly T[]
}

export function recycle<T>(values: readonly T[]): RecycledValues<T> {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('recycle must contain at least one value')
  }
  return Object.freeze({
    [recycledValuesMarker]: true as const,
    values: Object.freeze([...values]),
  })
}

interface RelationshipFactory<Output> {
  make(): Output
}

type ForRelationship = {
  readonly resolve: (rootIndex: number) => unknown
  readonly compose: (...args: never[]) => unknown
}

type HasRelationship = {
  readonly resolve: () => unknown
  readonly compose: (...args: never[]) => unknown
}

export abstract class Factory<T, TPersisted = T, Count extends number = 1> {
  protected readonly faker: FakerShim
  #count = 1
  readonly #mutators: Array<StateMutator<T>> = []
  #sequence: Array<SequenceValue<T>> | null = null
  readonly #forRelationships: ForRelationship[] = []
  readonly #hasRelationships: HasRelationship[] = []
  readonly #beforeCreateHooks: Array<(...args: never[]) => MaybePromise<void>> = []
  readonly #afterCreateHooks: Array<(...args: never[]) => MaybePromise<void>> = []

  constructor(faker: FakerShim = builtInFaker()) {
    this.faker = faker
  }

  protected abstract definition(): T

  count<NextCount extends number>(n: NextCount): Factory<T, TPersisted, NextCount> {
    if (!Number.isInteger(n) || n < 1) throw new Error(`count must be a positive integer, got ${n}`)
    this.#count = n
    return this as unknown as Factory<T, TPersisted, NextCount>
  }

  state(mutator: StateMutator<T>): this {
    this.#mutators.push(mutator)
    return this
  }

  sequence(values: readonly SequenceValue<T>[]): this {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('sequence must contain at least one state')
    }
    this.#sequence = [...values]
    return this
  }

  for<TRelated>(
    related: RelationshipFactory<TRelated> | RecycledValues<TRelated>,
    composer: RelationshipComposer<T, TRelated>,
  ): this {
    if (this.#isRecycled(related)) {
      this.#forRelationships.push({
        resolve: rootIndex => related.values[rootIndex % related.values.length],
        compose: composer,
      })
    }
    else {
      this.#forRelationships.push({
        resolve: () => {
          const made = related.make()
          if (Array.isArray(made)) {
            throw new TypeError('for relationship factory must make exactly one item; use count(1)')
          }
          return made
        },
        compose: composer,
      })
    }
    return this
  }

  has<RelatedOutput>(
    related: RelationshipFactory<RelatedOutput>,
    composer: RelationshipComposer<T, RelatedOutput>,
  ): this {
    this.#hasRelationships.push({
      resolve: () => related.make(),
      compose: composer,
    })
    return this
  }

  beforeCreate(hook: BeforeCreateHook<T>): this {
    this.#beforeCreateHooks.push(hook)
    return this
  }

  afterCreate(hook: AfterCreateHook<T, TPersisted>): this {
    this.#afterCreateHooks.push(hook)
    return this
  }

  make(overrides?: Partial<T>): FactoryOutput<T, Count> {
    const items = Array.from({ length: this.#count }, (_, index) => this.#buildOne(overrides, index))
    return this.#withCardinality(items)
  }

  create(
    this: Factory<T, T, Count>,
    persister: FactoryPersister<T>,
    overrides?: Partial<T>,
  ): Promise<FactoryOutput<T, Count>>
  create(
    adapter: FactoryPersistenceAdapter<T, TPersisted>,
    overrides?: Partial<T>,
  ): Promise<FactoryOutput<TPersisted, Count>>
  async create(
    persisterOrAdapter: FactoryPersister<T> | FactoryPersistenceAdapter<T, TPersisted>,
    overrides?: Partial<T>,
  ): Promise<FactoryOutput<T | TPersisted, Count>> {
    const persistedItems: Array<T | TPersisted> = []

    for (let index = 0; index < this.#count; index += 1) {
      const draft = this.#buildOne(overrides, index)
      for (const hook of this.#beforeCreateHooks) {
        await (hook as BeforeCreateHook<T>)(draft, index)
      }

      const persisted = typeof persisterOrAdapter === 'function'
        ? await this.#persistWithCallback(persisterOrAdapter, draft, index)
        : await persisterOrAdapter.persist(draft, index)

      for (const hook of this.#afterCreateHooks) {
        await (hook as AfterCreateHook<T, TPersisted>)(persisted as TPersisted, draft, index)
      }
      persistedItems.push(persisted)
    }

    return this.#withCardinality(persistedItems)
  }

  async #persistWithCallback(persister: FactoryPersister<T>, draft: T, index: number): Promise<T> {
    await persister(draft, index)
    return draft
  }

  #buildOne(overrides: Partial<T> | undefined, index: number): T {
    let draft = this.definition()
    for (const mutator of this.#mutators) draft = this.#apply(draft, mutator, index)

    if (this.#sequence !== null) {
      const sequenceValue = this.#sequence[index % this.#sequence.length]!
      draft = this.#apply(draft, sequenceValue, index)
    }

    for (const relationship of this.#forRelationships) {
      draft = this.#composeRelationship(
        draft,
        relationship.resolve(index),
        index,
        relationship.compose as RelationshipComposer<T, unknown>,
      )
    }
    for (const relationship of this.#hasRelationships) {
      draft = this.#composeRelationship(
        draft,
        relationship.resolve(),
        index,
        relationship.compose as RelationshipComposer<T, unknown>,
      )
    }

    if (overrides !== undefined) draft = this.#mergeIfPossible(draft, overrides)
    return draft
  }

  #composeRelationship(
    draft: T,
    related: unknown,
    index: number,
    composer: RelationshipComposer<T, unknown>,
  ): T {
    const composed = composer(draft, related, index)
    if (composed === null || typeof composed !== 'object') {
      throw new TypeError('relationship composer must return an object')
    }
    if (Array.isArray(composed)) {
      throw new TypeError('relationship composer must return an object, not an array')
    }
    if (composed === draft) return draft
    return this.#mergeIfPossible(draft, composed)
  }

  #apply(draft: T, mutator: StateMutator<T>, index: number): T {
    const output = typeof mutator === 'function'
      ? (mutator as (value: T, itemIndex: number) => Partial<T> | T)(draft, index)
      : mutator
    if (output === draft) return draft
    return this.#mergeIfPossible(draft, output)
  }

  #mergeIfPossible(draft: T, partial: Partial<T>): T {
    if (draft === null || typeof draft !== 'object') return draft
    return { ...(draft as object), ...(partial as object) } as T
  }

  #withCardinality<Value>(items: Value[]): FactoryOutput<Value, Count> {
    return (this.#count === 1 ? items[0]! : items) as FactoryOutput<Value, Count>
  }

  #isRecycled<Value>(value: unknown): value is RecycledValues<Value> {
    return typeof value === 'object' && value !== null && recycledValuesMarker in value
  }
}

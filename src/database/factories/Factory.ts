import { builtInFaker, type FakerShim } from './faker'

export type StateMutator<T> = Partial<T> | ((draft: T) => Partial<T> | T)

export type SequenceValue<T> = Partial<T> | ((draft: T, index: number) => Partial<T> | T)

export abstract class Factory<T> {
  protected readonly faker: FakerShim
  #count = 1
  readonly #mutators: Array<StateMutator<T>> = []
  #sequence: Array<SequenceValue<T>> | null = null

  constructor(faker: FakerShim = builtInFaker()) {
    this.faker = faker
  }

  protected abstract definition(): T

  count(n: number): this {
    if (!Number.isInteger(n) || n < 1) throw new Error(`count must be a positive integer, got ${n}`)
    this.#count = n
    return this
  }

  state(mutator: StateMutator<T>): this {
    this.#mutators.push(mutator)
    return this
  }

  sequence(values: readonly SequenceValue<T>[]): this {
    this.#sequence = [...values]
    return this
  }

  make(overrides?: Partial<T>): T | T[] {
    const items = Array.from({ length: this.#count }, (_, index) => this.#buildOne(overrides, index))
    return this.#count === 1 ? items[0]! : items
  }

  async create(
    persister: (item: T) => Promise<void>,
    overrides?: Partial<T>,
  ): Promise<T | T[]> {
    const made = this.make(overrides)
    if (Array.isArray(made)) {
      for (const item of made) await persister(item)
    }
    else {
      await persister(made)
    }
    return made
  }

  #buildOne(overrides: Partial<T> | undefined, index: number): T {
    let draft = this.definition()
    for (const mutator of this.#mutators) {
      draft = this.#apply(draft, mutator)
    }
    if (this.#sequence !== null) {
      const seqValue = this.#sequence[index % this.#sequence.length]!
      if (typeof seqValue === 'function') {
        const seqMutator = (d: T): Partial<T> | T => (seqValue as (d: T, i: number) => Partial<T> | T)(d, index)
        draft = this.#apply(draft, seqMutator)
      }
      else {
        draft = this.#apply(draft, seqValue)
      }
    }
    if (overrides !== undefined) {
      draft = this.#mergeIfPossible(draft, overrides)
    }
    return draft
  }

  #apply(draft: T, mutator: StateMutator<T>): T {
    if (typeof mutator === 'function') {
      const out = (mutator as (d: T) => Partial<T> | T)(draft)
      if (out === draft) return draft
      return this.#mergeIfPossible(draft, out as Partial<T>)
    }
    return this.#mergeIfPossible(draft, mutator)
  }

  #mergeIfPossible(draft: T, partial: Partial<T>): T {
    if (draft === null || typeof draft !== 'object') return draft
    return { ...(draft as object), ...(partial as object) } as T
  }
}

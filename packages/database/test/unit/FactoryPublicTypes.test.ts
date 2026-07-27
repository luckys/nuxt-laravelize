import { describe, expectTypeOf, it } from 'vitest'
import {
  Factory,
  builtInFaker,
  recycle,
  type AfterCreateHook,
  type BeforeCreateHook,
  type BuiltInFakerOptions,
  type FactoryOutput,
  type FactoryPersistenceAdapter,
  type FactoryPersister,
  type RecycledValues,
  type RelationshipComposer,
  type SequenceValue,
  type StateMutator,
} from '../../src/public-runtime'

class PublicFactory extends Factory<{ id: string }> {
  protected definition() { return { id: 'public' } }
}

describe('factory public types', () => {
  it('exports factory values and contracts from the runtime barrel', () => {
    expectTypeOf(new PublicFactory().make()).toEqualTypeOf<{ id: string }>()
    expectTypeOf(builtInFaker).toBeFunction()
    expectTypeOf(recycle).toBeFunction()
    expectTypeOf<AfterCreateHook<object, number>>().toBeFunction()
    expectTypeOf<BeforeCreateHook<object>>().toBeFunction()
    expectTypeOf<BuiltInFakerOptions>().toBeObject()
    expectTypeOf<FactoryOutput<string, 2>>().toEqualTypeOf<string[]>()
    expectTypeOf<FactoryPersistenceAdapter<object, number>>().toBeObject()
    expectTypeOf<FactoryPersister<object>>().toBeFunction()
    expectTypeOf<RecycledValues<object>>().toBeObject()
    expectTypeOf<RelationshipComposer<object, object>>().toBeFunction()
    expectTypeOf<SequenceValue<object>>().not.toBeNever()
    expectTypeOf<StateMutator<object>>().not.toBeNever()
  })
})
